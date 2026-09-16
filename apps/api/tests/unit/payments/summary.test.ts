import { Prisma, type InvoicePayment } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { databaseDate, invoiceDueDate } from '../../../src/features/payments/dates.js';
import { summarizePayments } from '../../../src/features/payments/summary.js';

function payment(
  id: string,
  amount: string,
  effectiveDate: string,
  kind: 'PAYMENT' | 'REFUND' = 'PAYMENT',
): InvoicePayment {
  return {
    id,
    invoiceId: '00000000-0000-4000-8000-000000000001',
    kind,
    amount: new Prisma.Decimal(amount),
    currency: 'DOP',
    method: 'CASH',
    effectiveDate: databaseDate(effectiveDate),
    reference: null,
    actorUserId: '00000000-0000-4000-8000-000000000002',
    idempotencyKey: id,
    createdAt: new Date(`${effectiveDate}T16:00:00.000Z`),
  };
}

describe('payment summary', () => {
  it('keeps a partial balance pending through the end of its due date', () => {
    const summary = summarizePayments(
      {
        status: 'COMPLETED',
        gross: new Prisma.Decimal('1000.00'),
        dueDate: databaseDate('2026-10-10'),
        payments: [payment('partial', '250.00', '2026-09-20')],
      },
      new Date('2026-10-11T03:59:59.000Z'),
    );

    expect(summary.state).toBe('PENDING');
    expect(summary.balance.toFixed(2)).toBe('750.00');
  });

  it('becomes overdue after the due date in Santo Domingo', () => {
    const summary = summarizePayments(
      {
        status: 'COMPLETED',
        gross: new Prisma.Decimal('1000.00'),
        dueDate: databaseDate('2026-10-10'),
        payments: [],
      },
      new Date('2026-10-11T04:00:00.000Z'),
    );

    expect(summary.state).toBe('OVERDUE');
  });

  it('uses the effective settlement date to distinguish paid late', () => {
    const summary = summarizePayments(
      {
        status: 'COMPLETED',
        gross: new Prisma.Decimal('1000.00'),
        dueDate: databaseDate('2026-10-10'),
        payments: [
          payment('second-recorded', '600.00', '2026-10-11'),
          payment('first-effective', '400.00', '2026-10-01'),
        ],
      },
      new Date('2026-10-12T12:00:00.000Z'),
    );

    expect(summary.state).toBe('PAID_LATE');
    expect(summary.settledOn).toEqual(databaseDate('2026-10-11'));
  });

  it('lets cancellation override financial state and exposes zero balance', () => {
    const summary = summarizePayments({
      status: 'CANCELLED',
      gross: new Prisma.Decimal('1000.00'),
      dueDate: databaseDate('2026-10-10'),
      payments: [payment('received', '250.00', '2026-09-20')],
    });

    expect(summary.state).toBe('CANCELLED');
    expect(summary.balance.toFixed(2)).toBe('0.00');
  });

  it('marks a settlement on the due date as paid, not paid late', () => {
    const summary = summarizePayments(
      {
        status: 'COMPLETED',
        gross: new Prisma.Decimal('1000.00'),
        dueDate: databaseDate('2026-10-10'),
        payments: [payment('settled', '1000.00', '2026-10-10')],
      },
      new Date('2026-10-20T12:00:00.000Z'),
    );

    expect(summary.state).toBe('PAID');
    expect(summary.settledOn).toEqual(databaseDate('2026-10-10'));
  });

  it('keeps a remaining balance pending when the due date is null', () => {
    const summary = summarizePayments(
      {
        status: 'COMPLETED',
        gross: new Prisma.Decimal('1000.00'),
        dueDate: null,
        payments: [payment('partial', '250.00', '2026-09-20')],
      },
      new Date('2099-01-01T12:00:00.000Z'),
    );

    expect(summary.state).toBe('PENDING');
    expect(summary.balance.toFixed(2)).toBe('750.00');
  });

  it('exposes additive refunds without using them as settlement or reopening the balance', () => {
    const summary = summarizePayments({
      status: 'COMPLETED',
      gross: new Prisma.Decimal('1000.00'),
      dueDate: databaseDate('2026-10-10'),
      payments: [
        payment('received', '1000.00', '2026-09-20'),
        payment('returned', '400.00', '2026-09-21', 'REFUND'),
      ],
    });

    expect(summary.state).toBe('PAID');
    expect(summary.paid.toFixed(2)).toBe('1000.00');
    expect(summary.refunded.toFixed(2)).toBe('400.00');
    expect(summary.balance.toFixed(2)).toBe('0.00');
    expect(summary.settledOn).toEqual(databaseDate('2026-09-20'));
  });

  it('uses the net received on a cancelled invoice without inventing outstanding balance', () => {
    const summary = summarizePayments({
      status: 'CANCELLED',
      gross: new Prisma.Decimal('1000.00'),
      dueDate: databaseDate('2026-10-10'),
      payments: [
        payment('received', '400.00', '2026-09-20'),
        payment('returned', '400.00', '2026-09-21', 'REFUND'),
      ],
    });

    expect(summary.state).toBe('CANCELLED');
    expect(summary.paid.minus(summary.refunded).toFixed(2)).toBe('0.00');
    expect(summary.balance.toFixed(2)).toBe('0.00');
  });

  it('breaks settlement ties by recorded time and then payment id', () => {
    const sameEffective = '2026-10-10';
    const earlierRecorded = payment('z-later-id', '400.00', sameEffective);
    earlierRecorded.createdAt = new Date('2026-10-10T12:00:00.000Z');
    const laterRecorded = payment('a-earlier-id', '600.00', sameEffective);
    laterRecorded.createdAt = new Date('2026-10-10T13:00:00.000Z');
    const sameTimeLeft = payment('b-second', '400.00', '2026-10-11');
    sameTimeLeft.createdAt = new Date('2026-10-11T12:00:00.000Z');
    const sameTimeRight = payment('a-first', '600.00', '2026-10-11');
    sameTimeRight.createdAt = new Date('2026-10-11T12:00:00.000Z');

    const byRecordedTime = summarizePayments({
      status: 'COMPLETED',
      gross: new Prisma.Decimal('1000.00'),
      dueDate: databaseDate('2026-10-10'),
      payments: [laterRecorded, earlierRecorded],
    });
    const byId = summarizePayments({
      status: 'COMPLETED',
      gross: new Prisma.Decimal('1000.00'),
      dueDate: databaseDate('2026-10-12'),
      payments: [sameTimeLeft, sameTimeRight],
    });

    expect(byRecordedTime.settledOn).toEqual(databaseDate(sameEffective));
    expect(byRecordedTime.state).toBe('PAID');
    expect(byId.settledOn).toEqual(databaseDate('2026-10-11'));
    expect(byId.state).toBe('PAID');
  });
});

describe('invoice due date', () => {
  it('adds 30 local calendar days instead of 30 exact 24-hour periods', () => {
    expect(invoiceDueDate(new Date('2026-09-10T02:30:00.000Z'), 30)).toEqual(
      databaseDate('2026-10-09'),
    );
    expect(invoiceDueDate(new Date('2026-09-10T04:30:00.000Z'), 30)).toEqual(
      databaseDate('2026-10-10'),
    );
  });

  it('uses the confirmation local date when the term is 0 days', () => {
    expect(invoiceDueDate(new Date('2026-09-10T04:30:00.000Z'), 0)).toEqual(
      databaseDate('2026-09-10'),
    );
  });

  it('adds 45 local calendar days from an evening Santo Domingo confirmation', () => {
    expect(invoiceDueDate(new Date('2026-09-16T00:00:00.000Z'), 45)).toEqual(
      databaseDate('2026-10-30'),
    );
  });
});
