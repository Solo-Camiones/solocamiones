import { Prisma, type InvoiceCurrency } from '@prisma/client';

import { MONEY_DECIMAL_PLACES } from '../sales/money/constants.js';
import type { InvoiceListRecord } from '../sales/types.js';
import { summarizePayments, type PaymentState } from './summary.js';

export type OpenReceivable = {
  invoice: InvoiceListRecord;
  invoiced: Prisma.Decimal;
  paid: Prisma.Decimal;
  balance: Prisma.Decimal;
  state: Exclude<PaymentState, 'PAID' | 'PAID_LATE' | 'CANCELLED'>;
};

export type CustomerOutstanding = {
  customerId: string;
  customerName: string;
  currency: InvoiceCurrency;
  invoiceCount: number;
  invoiced: Prisma.Decimal;
  paid: Prisma.Decimal;
  balance: Prisma.Decimal;
};

export function moneyString(value: Prisma.Decimal): string {
  return value.toFixed(MONEY_DECIMAL_PLACES);
}

export function openReceivables(invoices: InvoiceListRecord[], now = new Date()): OpenReceivable[] {
  const open: OpenReceivable[] = [];
  for (const invoice of invoices) {
    const summary = summarizePayments(invoice, now);
    if (!summary.balance.greaterThan(0)) continue;
    if (
      summary.state !== 'PENDING' &&
      summary.state !== 'PARTIALLY_PAID' &&
      summary.state !== 'OVERDUE' &&
      summary.state !== 'PARTIALLY_PAID_OVERDUE'
    )
      continue;
    open.push({
      invoice,
      invoiced: invoice.gross ?? new Prisma.Decimal(0),
      paid: summary.paid,
      balance: summary.balance,
      state: summary.state,
    });
  }
  // Newest issued first — matches GET /receivables list order (confirmedAt DESC).
  return open.sort((left, right) => {
    const issued =
      (right.invoice.confirmedAt?.getTime() ?? 0) - (left.invoice.confirmedAt?.getTime() ?? 0);
    if (issued !== 0) return issued;
    return right.invoice.id.localeCompare(left.invoice.id);
  });
}

export function customerOutstanding(open: OpenReceivable[]): CustomerOutstanding[] {
  const grouped = new Map<string, CustomerOutstanding>();
  for (const row of open) {
    const currency = row.invoice.currency;
    const key = `${row.invoice.customerId}:${currency}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.invoiceCount += 1;
      existing.invoiced = existing.invoiced.plus(row.invoiced);
      existing.paid = existing.paid.plus(row.paid);
      existing.balance = existing.balance.plus(row.balance);
      continue;
    }
    grouped.set(key, {
      customerId: row.invoice.customerId,
      customerName: row.invoice.customerName ?? row.invoice.customer.name,
      currency,
      invoiceCount: 1,
      invoiced: row.invoiced,
      paid: row.paid,
      balance: row.balance,
    });
  }
  return [...grouped.values()].sort((left, right) => {
    const name = left.customerName.localeCompare(right.customerName, 'es');
    if (name !== 0) return name;
    return left.currency.localeCompare(right.currency);
  });
}
