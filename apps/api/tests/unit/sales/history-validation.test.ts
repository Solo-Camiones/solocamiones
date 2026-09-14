import { Prisma, type InvoiceLine } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { historyEventSchema } from '../../../src/features/history/validation.js';
import { toLineHistorySnapshot } from '../../../src/features/sales/projection.js';

const id = '11111111-1111-4111-8111-111111111111';
const snapshot = {
  status: 'DRAFT' as const,
  number: null,
  currency: 'DOP' as const,
  fiscal: false,
  customerId: id,
};

describe('invoice draft history validation', () => {
  it('accepts INVOICE_DRAFT_CREATED with a USER actor and rejects extra payload fields', () => {
    const event = {
      actor: { actorType: 'USER' as const, actorUserId: id },
      subjectType: 'INVOICE' as const,
      subjectId: id,
      eventType: 'INVOICE_DRAFT_CREATED' as const,
      payload: snapshot,
    };
    expect(historyEventSchema.parse(event)).toEqual(event);
    expect(
      historyEventSchema.safeParse({
        ...event,
        payload: { ...snapshot, passwordHash: 'secret' },
      }).success,
    ).toBe(false);
    expect(
      historyEventSchema.safeParse({
        ...event,
        actor: { actorType: 'SYSTEM', actorUserId: null },
      }).success,
    ).toBe(false);
  });

  it('accepts INVOICE_LINE_ADDED and rejects extra payload fields', () => {
    const event = {
      actor: { actorType: 'USER' as const, actorUserId: id },
      subjectType: 'INVOICE' as const,
      subjectId: id,
      eventType: 'INVOICE_LINE_ADDED' as const,
      payload: {
        id,
        type: 'GENERIC' as const,
        description: 'Filtro',
        notes: null,
        quantity: '1.00',
        unitPrice: '118.00',
        acquisitionCostDop: null,
        costProvenance: 'UNKNOWN' as const,
        serviceId: null,
      },
    };
    expect(historyEventSchema.parse(event)).toEqual(event);
    const externalEvent = {
      ...event,
      payload: { ...event.payload, type: 'EXTERNAL' as const, description: 'Bomba externa' },
    };
    expect(historyEventSchema.parse(externalEvent)).toEqual(externalEvent);
    expect(
      historyEventSchema.safeParse({
        ...event,
        payload: { ...event.payload, passwordHash: 'secret' },
      }).success,
    ).toBe(false);
  });

  it('treats omitted invoice line notes as null on add and update events', () => {
    const line = {
      id,
      type: 'GENERIC' as const,
      description: 'Filtro',
      quantity: '1.00',
      unitPrice: '118.00',
      acquisitionCostDop: null,
      costProvenance: 'UNKNOWN' as const,
      serviceId: null,
    };
    const actor = { actorType: 'USER' as const, actorUserId: id };
    const added = historyEventSchema.parse({
      actor,
      subjectType: 'INVOICE',
      subjectId: id,
      eventType: 'INVOICE_LINE_ADDED',
      payload: line,
    });
    expect(added.eventType).toBe('INVOICE_LINE_ADDED');
    if (added.eventType === 'INVOICE_LINE_ADDED') {
      expect(added.payload.notes).toBeNull();
    }

    const updated = historyEventSchema.parse({
      actor,
      subjectType: 'INVOICE',
      subjectId: id,
      eventType: 'INVOICE_LINE_UPDATED',
      payload: { before: line, after: line },
    });
    expect(updated.eventType).toBe('INVOICE_LINE_UPDATED');
    if (updated.eventType === 'INVOICE_LINE_UPDATED') {
      expect(updated.payload.before.notes).toBeNull();
      expect(updated.payload.after.notes).toBeNull();
    }
  });

  it('snapshots a persisted line without notes as null for INVOICE_LINE_UPDATED', () => {
    const line = {
      id,
      invoiceId: id,
      type: 'GENERIC',
      description: 'Filtro',
      quantity: new Prisma.Decimal('1.00'),
      unitPrice: new Prisma.Decimal('118.00'),
      acquisitionCostDop: null,
      costProvenance: 'UNKNOWN',
      serviceId: null,
      gross: null,
      base: null,
      itbis: null,
      createdAt: new Date(),
    } as InvoiceLine;

    const payload = {
      before: toLineHistorySnapshot(line),
      after: toLineHistorySnapshot(line),
    };
    expect(payload.before.notes).toBeNull();
    expect(payload.after.notes).toBeNull();

    const parsed = historyEventSchema.parse({
      actor: { actorType: 'USER', actorUserId: id },
      subjectType: 'INVOICE',
      subjectId: id,
      eventType: 'INVOICE_LINE_UPDATED',
      payload,
    });
    expect(parsed.eventType).toBe('INVOICE_LINE_UPDATED');
  });

  it('accepts INVOICE_CONFIRMED with FAC- number and customer snapshot', () => {
    const event = {
      actor: { actorType: 'USER' as const, actorUserId: id },
      subjectType: 'INVOICE' as const,
      subjectId: id,
      eventType: 'INVOICE_CONFIRMED' as const,
      payload: {
        status: 'COMPLETED' as const,
        number: 'FAC-000001',
        currency: 'DOP' as const,
        fiscal: false,
        customerId: id,
        customerSnapshot: { name: 'Cliente contado', rnc: null, phone: null },
        totals: { gross: '118.00', base: '118.00', itbis: '0.00' },
        confirmedAt: '2026-09-08T18:00:00.000Z',
        dueDate: '2026-10-08',
        confirmedByUserId: id,
        confirmedByName: 'Ana Pérez',
      },
    };
    expect(historyEventSchema.parse(event)).toEqual(event);
    expect(
      historyEventSchema.safeParse({
        ...event,
        payload: { ...event.payload, passwordHash: 'secret' },
      }).success,
    ).toBe(false);
  });

  it('accepts INVOICE_GROSS_PROFIT_RECORDED with before/after amounts', () => {
    const event = {
      actor: { actorType: 'USER' as const, actorUserId: id },
      subjectType: 'INVOICE' as const,
      subjectId: id,
      eventType: 'INVOICE_GROSS_PROFIT_RECORDED' as const,
      payload: { before: null, after: '1250.50' },
    };
    expect(historyEventSchema.parse(event)).toEqual(event);
    expect(
      historyEventSchema.parse({
        ...event,
        payload: { before: '1250.50', after: '0.00' },
      }).payload,
    ).toEqual({ before: '1250.50', after: '0.00' });
    expect(
      historyEventSchema.safeParse({
        ...event,
        payload: { ...event.payload, reason: 'optional' },
      }).success,
    ).toBe(false);
  });

  it('accepts INVOICE_USD_FX_RETRIED for recorded and unavailable outcomes', () => {
    const event = {
      actor: { actorType: 'USER' as const, actorUserId: id },
      subjectType: 'INVOICE' as const,
      subjectId: id,
      eventType: 'INVOICE_USD_FX_RETRIED' as const,
      payload: {
        outcome: 'UNAVAILABLE' as const,
        reason: 'plan-upgrade-required',
        asOf: '2026-09-08T18:00:00.000Z',
        after: null,
      },
    };
    expect(historyEventSchema.parse(event)).toEqual(event);
    const recorded = historyEventSchema.parse({
      ...event,
      payload: {
        outcome: 'RECORDED',
        reason: null,
        asOf: '2026-09-08T18:00:00.000Z',
        after: {
          exchangeRateDopPerUsd: '61.5',
          source: 'ExchangeRate-API',
          rateUpdatedAt: '2026-09-08T00:00:00.000Z',
          obtainedAt: '2026-09-08T12:00:00.000Z',
        },
      },
    });
    expect(recorded.eventType).toBe('INVOICE_USD_FX_RETRIED');
    if (recorded.eventType === 'INVOICE_USD_FX_RETRIED') {
      expect(recorded.payload.outcome).toBe('RECORDED');
    }
    expect(
      historyEventSchema.safeParse({
        ...event,
        payload: { ...event.payload, extra: true },
      }).success,
    ).toBe(false);
  });

  it('accepts INVOICE_USD_FX_RECORDED with the initial rate provenance', () => {
    const event = {
      actor: { actorType: 'USER' as const, actorUserId: id },
      subjectType: 'INVOICE' as const,
      subjectId: id,
      eventType: 'INVOICE_USD_FX_RECORDED' as const,
      payload: {
        asOf: '2026-09-08T18:00:00.000Z',
        after: {
          exchangeRateDopPerUsd: '61.5',
          source: 'ExchangeRate-API',
          rateUpdatedAt: '2026-09-08T00:00:00.000Z',
          obtainedAt: '2026-09-08T12:00:00.000Z',
        },
      },
    };

    expect(historyEventSchema.parse(event)).toEqual(event);
    expect(
      historyEventSchema.safeParse({
        ...event,
        payload: { ...event.payload, source: 'not-at-the-provenance-level' },
      }).success,
    ).toBe(false);
  });

  it('accepts INVOICE_PDF_GENERATED and INVOICE_PDF_FAILED without extra fields', () => {
    const generated = {
      actor: { actorType: 'USER' as const, actorUserId: id },
      subjectType: 'INVOICE' as const,
      subjectId: id,
      eventType: 'INVOICE_PDF_GENERATED' as const,
      payload: { status: 'READY' as const, errorId: null, templateVersion: 'internal-v1' },
    };
    expect(historyEventSchema.parse(generated)).toEqual(generated);
    const failed = {
      ...generated,
      eventType: 'INVOICE_PDF_FAILED' as const,
      payload: {
        status: 'FAILED' as const,
        errorId: id,
        templateVersion: 'internal-v1',
      },
    };
    expect(historyEventSchema.parse(failed)).toEqual(failed);
    expect(
      historyEventSchema.safeParse({
        ...generated,
        payload: { ...generated.payload, extra: true },
      }).success,
    ).toBe(false);
    expect(
      historyEventSchema.safeParse({
        ...failed,
        payload: { ...failed.payload, errorId: null },
      }).success,
    ).toBe(false);
  });
});
