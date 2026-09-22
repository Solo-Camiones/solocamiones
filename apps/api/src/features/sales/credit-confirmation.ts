import { Prisma, type CustomerType, type InvoiceCurrency, type Role } from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  businessDateString,
  databaseDate,
  databaseDateString,
  invoiceDueDate,
} from '../payments/dates.js';
import {
  CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE,
  CONDUCE_DUE_DATE_BEFORE_EMISSION_MESSAGE,
  CONDUCE_DUE_DATE_NOT_ALLOWED_MESSAGE,
  CONDUCE_DUE_DATE_REQUIRED_MESSAGE,
  CONDUCE_RETRY_MISMATCH_MESSAGE,
  CREDIT_LIMIT_EXCEEDED_MESSAGE,
  SELLER_CREDIT_CONFIRM_PAYMENT_FORBIDDEN_MESSAGE,
  USD_INVOICE_MUST_BE_PAID_IN_FULL_MESSAGE,
} from './constants.js';
import type { SaleCondition } from './types.js';

export type { SaleCondition };

export type ConfirmationCustomer = {
  customerType: CustomerType;
  isDefault: boolean;
  creditLimitDop: Prisma.Decimal | null;
  creditTermDays: number | null;
};

/**
 * Canonical idempotency key for the payment written inside confirm/convert.
 * Always stored as this value so saleCondition / PDF can reconstruct it without
 * guessing from timestamps (a nearby CxC payment must not count as initial).
 */
export function confirmationPaymentIdempotencyKey(invoiceId: string): string {
  return `confirm:${invoiceId}`;
}

function isFullySettled(
  invoiceGross: Prisma.Decimal,
  initialPaymentAmount: Prisma.Decimal | null,
): boolean {
  if (invoiceGross.isZero()) {
    return initialPaymentAmount == null || initialPaymentAmount.isZero();
  }
  return initialPaymentAmount != null && initialPaymentAmount.equals(invoiceGross);
}

/**
 * PDF / commercial label: Al contado only when confirmation settled 100% of the gross.
 * A CREDIT customer who pays in full at confirm is still Al contado.
 */
export function saleConditionFromInitialSettlement(
  invoiceGross: Prisma.Decimal,
  initialPaymentAmount: Prisma.Decimal | null,
): SaleCondition {
  return isFullySettled(invoiceGross, initialPaymentAmount) ? 'CASH' : 'CREDIT';
}

type ConfirmationPaymentSource = {
  id: string;
  payments: Array<{
    kind: string;
    amount: Prisma.Decimal;
    idempotencyKey?: string | null;
  }>;
};

/**
 * Reconstruct the confirmation payment by canonical key only (DOC-001).
 * No time-window fallback: later CxC payments must never alter saleCondition.
 */
export function confirmationInitialPaymentAmount(
  invoice: ConfirmationPaymentSource,
): Prisma.Decimal | null {
  const confirmKey = confirmationPaymentIdempotencyKey(invoice.id);
  const byKey = invoice.payments.find(
    (payment) => payment.kind === 'PAYMENT' && payment.idempotencyKey === confirmKey,
  );
  return byKey?.amount ?? null;
}

/** Named CASH (not default Cliente contado) — Admin conduce balance exception target (CON-002). */
export function isNamedCashCustomer(customer: ConfirmationCustomer): boolean {
  return customer.customerType === 'CASH' && !customer.isDefault;
}

function requiresFullSettlement(customer: ConfirmationCustomer, currency: InvoiceCurrency): boolean {
  return customer.customerType === 'CASH' || customer.isDefault || currency === 'USD';
}

/** Cash and USD invoices are due on the confirmation business date; CREDIT+DOP uses the customer term. */
export function confirmationDueTermDays(
  customer: ConfirmationCustomer,
  currency: InvoiceCurrency,
): number {
  if (customer.customerType === 'CREDIT' && currency === 'DOP') {
    return customer.creditTermDays ?? 0;
  }
  return 0;
}

export function invoiceNewBalance(
  invoiceGross: Prisma.Decimal,
  initialPaymentAmount: Prisma.Decimal | null,
): Prisma.Decimal {
  const paid = initialPaymentAmount ?? new Prisma.Decimal(0);
  return Prisma.Decimal.max(invoiceGross.minus(paid), 0);
}

/**
 * SALE-005 / PAY-001: direct invoice confirmation (and Seller/default conduce paths via reuse).
 * Named-CASH Admin balance on conduce is intentionally not here — see assertConduceInitialPaymentPolicy.
 */
export function assertInitialPaymentPolicy(input: {
  customer: ConfirmationCustomer;
  currency: InvoiceCurrency;
  actorRole: Role;
  invoiceGross: Prisma.Decimal;
  initialPaymentAmount: Prisma.Decimal | null;
}): void {
  const { customer, currency, actorRole, invoiceGross, initialPaymentAmount } = input;

  if (requiresFullSettlement(customer, currency)) {
    if (isFullySettled(invoiceGross, initialPaymentAmount)) return;
    const message =
      customer.customerType === 'CREDIT' && currency === 'USD'
        ? USD_INVOICE_MUST_BE_PAID_IN_FULL_MESSAGE
        : CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE;
    throw AppError.conflict(message);
  }

  if (actorRole === 'SELLER' && initialPaymentAmount != null) {
    throw AppError.forbidden(SELLER_CREDIT_CONFIRM_PAYMENT_FORBIDDEN_MESSAGE);
  }
}

/**
 * CON-002: Admin may leave balance on named CASH DOP/USD conduces only.
 * Default Cliente contado, Seller, and CREDIT USD still require full settlement.
 */
export function assertConduceInitialPaymentPolicy(input: {
  customer: ConfirmationCustomer;
  currency: InvoiceCurrency;
  actorRole: Role;
  invoiceGross: Prisma.Decimal;
  initialPaymentAmount: Prisma.Decimal | null;
}): void {
  if (input.actorRole === 'ADMINISTRATOR' && isNamedCashCustomer(input.customer)) {
    return;
  }
  assertInitialPaymentPolicy(input);
}

/**
 * Resolves dueDate for conduce emission.
 * Admin named-CASH with open balance: actor-supplied calendar day ≥ local emission day.
 * CREDIT DOP: frozen term. Otherwise emission day (term 0).
 */
export function resolveConduceDueDate(input: {
  customer: ConfirmationCustomer;
  currency: InvoiceCurrency;
  actorRole: Role;
  confirmedAt: Date;
  newBalance: Prisma.Decimal;
  actorDueDate: string | undefined;
}): Date {
  const { customer, currency, actorRole, confirmedAt, newBalance, actorDueDate } = input;
  const needsActorDueDate =
    actorRole === 'ADMINISTRATOR' &&
    isNamedCashCustomer(customer) &&
    newBalance.greaterThan(0);

  if (needsActorDueDate) {
    if (actorDueDate == null) {
      throw AppError.conflict(CONDUCE_DUE_DATE_REQUIRED_MESSAGE);
    }
    const emissionDay = businessDateString(confirmedAt);
    if (actorDueDate < emissionDay) {
      throw AppError.conflict(CONDUCE_DUE_DATE_BEFORE_EMISSION_MESSAGE);
    }
    return databaseDate(actorDueDate);
  }

  if (actorDueDate != null) {
    throw AppError.conflict(CONDUCE_DUE_DATE_NOT_ALLOWED_MESSAGE);
  }

  return invoiceDueDate(confirmedAt, confirmationDueTermDays(customer, currency));
}

export function assertCreditExposureWithinLimit(input: {
  customer: ConfirmationCustomer;
  currency: InvoiceCurrency;
  openExposure: Prisma.Decimal;
  newBalance: Prisma.Decimal;
}): void {
  if (input.customer.customerType !== 'CREDIT' || input.currency !== 'DOP') return;
  if (input.newBalance.isZero()) return;
  if (
    input.customer.creditLimitDop == null ||
    input.openExposure.plus(input.newBalance).greaterThan(input.customer.creditLimitDop)
  ) {
    throw AppError.conflict(CREDIT_LIMIT_EXCEEDED_MESSAGE);
  }
}

type ConduceRetryPaymentSource = {
  id: string;
  quoteNumber: string | null;
  dueDate: Date | null;
  gross: Prisma.Decimal | null;
  snapshotCustomerType: CustomerType | null;
  customer: { isDefault: boolean };
  payments: Array<{
    kind: string;
    amount: Prisma.Decimal;
    method: string | null;
    reference: string | null;
    idempotencyKey?: string | null;
  }>;
};

type ConduceRetryPaymentPayload = {
  amount: string;
  method: string;
  reference?: string | null;
};

/**
 * Idempotent conduce retry: same commercial intent as the first emission, or 409.
 * Compares origen (draft vs quote), confirm:{id} payment, and dueDate.
 */
export function assertConduceRetryMatches(input: {
  invoice: ConduceRetryPaymentSource;
  sourceStatus: 'DRAFT' | 'QUOTE_ISSUED';
  payment?: ConduceRetryPaymentPayload;
  dueDate?: string;
}): void {
  const fromQuote = input.invoice.quoteNumber != null;
  if (input.sourceStatus === 'DRAFT' && fromQuote) {
    throw AppError.conflict(CONDUCE_RETRY_MISMATCH_MESSAGE);
  }
  if (input.sourceStatus === 'QUOTE_ISSUED' && !fromQuote) {
    throw AppError.conflict(CONDUCE_RETRY_MISMATCH_MESSAGE);
  }

  const confirmKey = confirmationPaymentIdempotencyKey(input.invoice.id);
  const persistedPayment = input.invoice.payments.find(
    (payment) => payment.kind === 'PAYMENT' && payment.idempotencyKey === confirmKey,
  );

  if (input.payment == null) {
    if (persistedPayment != null) {
      throw AppError.conflict(CONDUCE_RETRY_MISMATCH_MESSAGE);
    }
  } else if (
    persistedPayment == null ||
    !persistedPayment.amount.equals(input.payment.amount) ||
    persistedPayment.method !== input.payment.method ||
    persistedPayment.reference !== (input.payment.reference ?? null)
  ) {
    throw AppError.conflict(CONDUCE_RETRY_MISMATCH_MESSAGE);
  }

  const persistedDueDate =
    input.invoice.dueDate == null ? null : databaseDateString(input.invoice.dueDate);

  if (input.dueDate !== undefined) {
    if (persistedDueDate !== input.dueDate) {
      throw AppError.conflict(CONDUCE_RETRY_MISMATCH_MESSAGE);
    }
    return;
  }

  // Admin named-CASH with balance required actor dueDate on first emission; omit ≠ same payload.
  const initialAmount = persistedPayment?.amount ?? null;
  const gross = input.invoice.gross ?? new Prisma.Decimal(0);
  const remaining = invoiceNewBalance(gross, initialAmount);
  const namedCashWithBalance =
    input.invoice.snapshotCustomerType === 'CASH' &&
    !input.invoice.customer.isDefault &&
    remaining.greaterThan(0);
  if (namedCashWithBalance) {
    throw AppError.conflict(CONDUCE_RETRY_MISMATCH_MESSAGE);
  }
}
