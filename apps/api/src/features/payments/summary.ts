import { Prisma, type InvoicePayment, type InvoiceStatus } from '@prisma/client';

import { databaseDateString, todayBusinessDate } from './dates.js';

export type PaymentState = 'PENDING' | 'OVERDUE' | 'PAID' | 'PAID_LATE' | 'CANCELLED';

type PaymentSummaryInput = {
  status: InvoiceStatus;
  gross: Prisma.Decimal | null;
  dueDate: Date | null;
  payments: InvoicePayment[];
};

export type PaymentSummary = {
  state: PaymentState;
  paid: Prisma.Decimal;
  refunded: Prisma.Decimal;
  balance: Prisma.Decimal;
  settledOn: Date | null;
};

function sumKind(payments: InvoicePayment[], kind: InvoicePayment['kind']): Prisma.Decimal {
  return payments
    .filter((payment) => payment.kind === kind)
    .reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
}

function settlementDate(gross: Prisma.Decimal, payments: InvoicePayment[]): Date | null {
  let accumulated = new Prisma.Decimal(0);
  const ordered = payments
    .filter((payment) => payment.kind === 'PAYMENT')
    .sort((left, right) => {
      const effective = left.effectiveDate.getTime() - right.effectiveDate.getTime();
      if (effective !== 0) return effective;
      const recorded = left.createdAt.getTime() - right.createdAt.getTime();
      return recorded !== 0 ? recorded : left.id.localeCompare(right.id);
    });
  for (const payment of ordered) {
    accumulated = accumulated.plus(payment.amount);
    if (accumulated.greaterThanOrEqualTo(gross)) return payment.effectiveDate;
  }
  return null;
}

export function summarizePayments(input: PaymentSummaryInput, now = new Date()): PaymentSummary {
  const gross = input.gross ?? new Prisma.Decimal(0);
  const paid = sumKind(input.payments, 'PAYMENT');
  const refunded = sumKind(input.payments, 'REFUND');
  const settledOn = settlementDate(gross, input.payments);
  if (input.status === 'CANCELLED') {
    return { state: 'CANCELLED', paid, refunded, balance: new Prisma.Decimal(0), settledOn };
  }

  const balance = Prisma.Decimal.max(gross.minus(paid), 0);
  if (balance.isZero() && input.dueDate && settledOn) {
    const late = databaseDateString(settledOn) > databaseDateString(input.dueDate);
    return { state: late ? 'PAID_LATE' : 'PAID', paid, refunded, balance, settledOn };
  }
  if (
    balance.greaterThan(0) &&
    input.dueDate &&
    todayBusinessDate(now).getTime() > input.dueDate.getTime()
  ) {
    return { state: 'OVERDUE', paid, refunded, balance, settledOn };
  }
  return { state: 'PENDING', paid, refunded, balance, settledOn };
}
