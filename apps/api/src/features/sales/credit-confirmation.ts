import { Prisma, type CustomerType, type InvoiceCurrency, type Role } from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE,
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
