import { Prisma, type InvoicePayment } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  customerOutstanding,
  moneyString,
  openReceivables,
  type OpenReceivable,
} from '../../../src/features/payments/receivables.js';
import { databaseDate } from '../../../src/features/payments/dates.js';
import type { InvoiceListRecord } from '../../../src/features/sales/types.js';

function payment(
  id: string,
  amount: string,
  effectiveDate: string,
  kind: 'PAYMENT' | 'REFUND' = 'PAYMENT',
): InvoicePayment {
  return {
    id,
    invoiceId: 'invoice',
    kind,
    amount: new Prisma.Decimal(amount),
    currency: 'DOP',
    method: 'CASH',
    effectiveDate: databaseDate(effectiveDate),
    reference: null,
    actorUserId: 'actor',
    idempotencyKey: id,
    createdAt: new Date(`${effectiveDate}T12:00:00.000Z`),
  };
}

function invoice(
  id: string,
  options: {
    status?: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
    gross?: string | null;
    dueDate?: string | null;
    payments?: InvoicePayment[];
    currency?: 'DOP' | 'USD';
  } = {},
): InvoiceListRecord {
  const dueDate = options.dueDate === undefined ? '2099-01-01' : options.dueDate;
  return {
    id,
    status: options.status ?? 'COMPLETED',
    gross: options.gross === null ? null : new Prisma.Decimal(options.gross ?? '100.00'),
    dueDate: dueDate === null ? null : databaseDate(dueDate),
    payments: options.payments ?? [],
    currency: options.currency ?? 'DOP',
    customerId: `customer-${id}`,
    customerName: `Customer ${id}`,
    customer: { name: `Customer ${id}` },
    lines: [],
  } as unknown as InvoiceListRecord;
}

function openRow(
  customerId: string,
  customerName: string,
  currency: 'DOP' | 'USD',
  invoiced: string,
  paid: string,
  balance: string,
): OpenReceivable {
  return {
    invoice: {
      customerId,
      customerName,
      currency,
      customer: { name: customerName },
    } as unknown as InvoiceListRecord,
    invoiced: new Prisma.Decimal(invoiced),
    paid: new Prisma.Decimal(paid),
    balance: new Prisma.Decimal(balance),
    state: 'PENDING',
  };
}

describe('customer outstanding summary', () => {
  it('groups by customer and currency without converting DOP and USD', () => {
    const rows = customerOutstanding([
      openRow('cust-a', 'Taller Norte', 'DOP', '1000.00', '250.00', '750.00'),
      openRow('cust-a', 'Taller Norte', 'USD', '200.00', '0.00', '200.00'),
      openRow('cust-a', 'Taller Norte', 'DOP', '400.00', '0.00', '400.00'),
    ]);

    expect(rows.map((row) => ({
      customerId: row.customerId,
      customerName: row.customerName,
      currency: row.currency,
      invoiceCount: row.invoiceCount,
      invoiced: row.invoiced.toFixed(2),
      paid: row.paid.toFixed(2),
      balance: row.balance.toFixed(2),
    }))).toEqual([
      {
        customerId: 'cust-a',
        customerName: 'Taller Norte',
        currency: 'DOP',
        invoiceCount: 2,
        invoiced: '1400.00',
        paid: '250.00',
        balance: '1150.00',
      },
      {
        customerId: 'cust-a',
        customerName: 'Taller Norte',
        currency: 'USD',
        invoiceCount: 1,
        invoiced: '200.00',
        paid: '0.00',
        balance: '200.00',
      },
    ]);
  });

  it('uses the live customer fallback and sorts equal names by currency', () => {
    const dop = openRow('cust-z', 'Fallback Name', 'DOP', '100.00', '0.00', '100.00');
    dop.invoice.customerName = null;
    dop.invoice.customer.name = 'Taller Central';
    const usd = openRow('cust-z', 'Taller Central', 'USD', '20.00', '0.00', '20.00');
    const earlier = openRow('cust-a', 'Almacén Primero', 'DOP', '50.00', '0.00', '50.00');

    expect(customerOutstanding([usd, dop, earlier]).map((row) => [row.customerName, row.currency])).toEqual([
      ['Almacén Primero', 'DOP'],
      ['Taller Central', 'DOP'],
      ['Taller Central', 'USD'],
    ]);
  });
});

describe('open receivables', () => {
  it('keeps pending and overdue balances and sorts null or equal due dates by id', () => {
    const rows = openReceivables([
      invoice('dated-b', { dueDate: '2099-01-01' }),
      invoice('overdue', { dueDate: '2000-01-01', payments: [payment('partial', '25.00', '2000-01-01')] }),
      invoice('no-date', { dueDate: null }),
      invoice('dated-a', { dueDate: '2099-01-01' }),
    ]);

    expect(rows.map((row) => ({
      id: row.invoice.id,
      state: row.state,
      invoiced: row.invoiced.toFixed(2),
      paid: row.paid.toFixed(2),
      balance: row.balance.toFixed(2),
    }))).toEqual([
      { id: 'no-date', state: 'PENDING', invoiced: '100.00', paid: '0.00', balance: '100.00' },
      { id: 'overdue', state: 'OVERDUE', invoiced: '100.00', paid: '25.00', balance: '75.00' },
      { id: 'dated-a', state: 'PENDING', invoiced: '100.00', paid: '0.00', balance: '100.00' },
      { id: 'dated-b', state: 'PENDING', invoiced: '100.00', paid: '0.00', balance: '100.00' },
    ]);
  });

  it.each([
    { id: 'paid', dueDate: '2026-01-10', payments: [payment('paid', '100.00', '2026-01-10')] },
    { id: 'paid-late', dueDate: '2026-01-10', payments: [payment('paid-late', '100.00', '2026-01-11')] },
    { id: 'cancelled', status: 'CANCELLED' as const, dueDate: '2026-01-10' },
    { id: 'zero-total', gross: null, dueDate: null },
  ])('excludes $id from the open projection', (options) => {
    expect(
      openReceivables([
        invoice(options.id, options),
        invoice('open', { dueDate: '2099-01-01' }),
      ]).map((row) => row.invoice.id),
    ).toEqual(['open']);
  });

  it('keeps DOP and USD open balances on separate invoices', () => {
    const rows = openReceivables([
      invoice('dop-open', { currency: 'DOP', dueDate: '2099-01-01' }),
      invoice('usd-open', { currency: 'USD', dueDate: '2099-01-01' }),
    ]);

    expect(rows.map((row) => [row.invoice.id, row.invoice.currency, row.state])).toEqual([
      ['dop-open', 'DOP', 'PENDING'],
      ['usd-open', 'USD', 'PENDING'],
    ]);
    expect(moneyString(rows[0]!.balance)).toBe('100.00');
  });
});
