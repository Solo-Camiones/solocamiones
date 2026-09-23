import {
  Prisma,
  type Customer,
  type InvoiceCurrency,
  type InvoiceLine,
  type PaymentMethod,
} from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { databaseDateString, todayBusinessDate } from '../payments/dates.js';
import { summarizePayments } from '../payments/summary.js';
import type { CustomerRepository } from '../customers/repository.js';
import type { HistoryRepository } from '../history/repository.js';
import type { PaymentRepository } from '../payments/repository.js';
import {
  EMPTY_DRAFT_CONFIRM_MESSAGE,
  EXPIRED_QUOTE_CONVERT_MESSAGE,
  PAYMENT_EXCEEDS_BALANCE_MESSAGE,
} from './constants.js';
import {
  assertCreditExposureWithinLimit,
  confirmationPaymentIdempotencyKey,
  invoiceNewBalance,
  type ConfirmationCustomer,
} from './credit-confirmation.js';
import {
  applyInvoiceDiscount,
  calculateLineMoney,
  isTaxableLineType,
  type DiscountedInvoiceMoney,
  type RoundedLineMoney,
} from './money/index.js';
import { assertDraftLineTypeEnabled } from './policies.js';
import { isQuoteExpired } from './quote-dates.js';
import type { SalesRepository } from './repository.js';
import type { InvoiceRecord } from './types.js';

export type RecognitionLineMoney = {
  line: InvoiceLine;
  money: RoundedLineMoney;
};

export type RecognitionPaymentInput = {
  amount: string;
  method: PaymentMethod;
  reference?: string | null;
};

/**
 * Shared pre-checks for draft/quote → recognised sale (invoice or conduce).
 * Caller still owns status-transition conflict messages (they differ per path).
 */
export function assertRecognitionSourceReady(
  invoice: Pick<InvoiceRecord, 'lines' | 'quoteExpiresAt'>,
  sourceStatus: 'DRAFT' | 'QUOTE_ISSUED',
): void {
  if (sourceStatus === 'QUOTE_ISSUED' && isQuoteExpired(invoice.quoteExpiresAt)) {
    throw AppError.conflict(EXPIRED_QUOTE_CONVERT_MESSAGE);
  }
  if (invoice.lines.length === 0) throw AppError.conflict(EMPTY_DRAFT_CONFIRM_MESSAGE);
  for (const line of invoice.lines) {
    assertDraftLineTypeEnabled(line.type);
  }
}

/**
 * Line money + invoice totals for recognition.
 * Issued quotes keep frozen line money; drafts recalculate from unit price.
 */
export function resolveSaleLineMoneyAndTotals(input: {
  lines: InvoiceLine[];
  applyItbis: boolean;
  discountPercent: Prisma.Decimal;
  preferFrozenLineMoney: boolean;
}): { lineMoney: RecognitionLineMoney[]; totals: DiscountedInvoiceMoney } {
  const lineMoney = input.lines.map((line) => ({
    line,
    money: input.preferFrozenLineMoney
      ? (() => {
          if (line.gross == null || line.base == null || line.itbis == null) {
            throw AppError.internal('Issued quote line is missing frozen money');
          }
          return { gross: line.gross, base: line.base, itbis: line.itbis };
        })()
      : calculateLineMoney({
          type: line.type,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          applyItbis: input.applyItbis,
        }),
  }));
  const totals = applyInvoiceDiscount({
    lines: lineMoney.map(({ line, money }) => ({
      ...money,
      taxable: isTaxableLineType(line.type),
    })),
    discountPercent: input.discountPercent,
    applyItbis: input.applyItbis,
  });
  return { lineMoney, totals };
}

export function parseInitialPaymentAmount(
  payment: RecognitionPaymentInput | undefined,
  invoiceGross: Prisma.Decimal,
): Prisma.Decimal | null {
  const initialPaymentAmount = payment ? new Prisma.Decimal(payment.amount) : null;
  if (initialPaymentAmount?.greaterThan(invoiceGross)) {
    throw AppError.conflict(PAYMENT_EXCEEDS_BALANCE_MESSAGE);
  }
  return initialPaymentAmount;
}

export async function assertRecognitionCreditExposure(input: {
  customers: Pick<CustomerRepository, 'findCompletedInvoicesWithPayments'>;
  customer: ConfirmationCustomer & { id: string };
  currency: InvoiceCurrency;
  invoiceGross: Prisma.Decimal;
  initialPaymentAmount: Prisma.Decimal | null;
}): Promise<Prisma.Decimal> {
  const newBalance = invoiceNewBalance(input.invoiceGross, input.initialPaymentAmount);
  const openInvoices = await input.customers.findCompletedInvoicesWithPayments(input.customer.id);
  const openExposure = openInvoices.reduce(
    (sum, invoice) => sum.plus(summarizePayments(invoice).balance),
    new Prisma.Decimal(0),
  );
  assertCreditExposureWithinLimit({
    customer: input.customer,
    currency: input.currency,
    openExposure,
    newBalance,
  });
  return newBalance;
}

/** Commercial identity snapshot: issued quote freezes name/RNC/phone; draft uses live customer. */
export function recognitionCustomerSnapshot(input: {
  sourceStatus: 'DRAFT' | 'QUOTE_ISSUED';
  invoice: Pick<InvoiceRecord, 'customerName' | 'customerRnc' | 'customerPhone'>;
  customer: Pick<Customer, 'name' | 'rnc'> & {
    contacts: Array<{ isPrimary: boolean; phone: string | null }>;
  };
}): {
  customerName: string;
  customerRnc: string | null;
  customerPhone: string | null;
} {
  const primaryPhone =
    input.customer.contacts.find((contact) => contact.isPrimary)?.phone ?? null;
  if (input.sourceStatus === 'QUOTE_ISSUED') {
    return {
      customerName: input.invoice.customerName!,
      customerRnc: input.invoice.customerRnc,
      customerPhone: input.invoice.customerPhone,
    };
  }
  return {
    customerName: input.customer.name,
    customerRnc: input.customer.rnc,
    customerPhone: primaryPhone,
  };
}

export function recognitionPersistedLineMoney(lineMoney: RecognitionLineMoney[]) {
  return lineMoney.map(({ line, money }) => ({
    id: line.id,
    gross: money.gross,
    base: money.base,
    itbis: money.itbis,
  }));
}

/**
 * Writes the confirmation-keyed initial payment and PAYMENT_RECORDED history,
 * then reloads the sale aggregate (same shape for invoice and conduce).
 */
export async function recordInitialRecognitionPayment(input: {
  invoiceId: string;
  actorId: string;
  currency: InvoiceCurrency;
  confirmedAt: Date;
  payment: RecognitionPaymentInput;
  initialPaymentAmount: Prisma.Decimal;
  payments: Pick<PaymentRepository, 'createPayment'>;
  history: Pick<HistoryRepository, 'append'>;
  sales: Pick<SalesRepository, 'findById'>;
}): Promise<InvoiceRecord> {
  const payment = await input.payments.createPayment({
    invoiceId: input.invoiceId,
    amount: input.initialPaymentAmount,
    currency: input.currency,
    method: input.payment.method,
    effectiveDate: todayBusinessDate(input.confirmedAt),
    reference: input.payment.reference ?? null,
    actorUserId: input.actorId,
    // Always confirm:{id} so saleCondition reconstruction ignores nearby CxC payments.
    idempotencyKey: confirmationPaymentIdempotencyKey(input.invoiceId),
  });
  await input.history.append({
    actor: { actorType: 'USER', actorUserId: input.actorId },
    subjectType: 'INVOICE',
    subjectId: input.invoiceId,
    eventType: 'PAYMENT_RECORDED',
    payload: {
      paymentId: payment.id,
      amount: payment.amount.toFixed(2),
      currency: payment.currency,
      method: payment.method,
      effectiveDate: databaseDateString(payment.effectiveDate),
      reference: payment.reference,
    },
  });
  return (await input.sales.findById(input.invoiceId))!;
}
