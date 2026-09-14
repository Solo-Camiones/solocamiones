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

export function openReceivables(invoices: InvoiceListRecord[]): OpenReceivable[] {
  const open: OpenReceivable[] = [];
  for (const invoice of invoices) {
    const summary = summarizePayments(invoice);
    if (!summary.balance.greaterThan(0)) continue;
    if (summary.state !== 'PENDING' && summary.state !== 'OVERDUE') continue;
    open.push({
      invoice,
      invoiced: invoice.gross ?? new Prisma.Decimal(0),
      paid: summary.paid,
      balance: summary.balance,
      state: summary.state,
    });
  }
  return open.sort((left, right) => {
    const due = (left.invoice.dueDate?.getTime() ?? 0) - (right.invoice.dueDate?.getTime() ?? 0);
    if (due !== 0) return due;
    return left.invoice.id.localeCompare(right.invoice.id);
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
