import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { salesTransaction } from '../../../src/features/sales/transaction.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { COMPLETED_CASH_SNAPSHOT, invoiceIssuedAtFrom } from '../../helpers/sales.js';

async function cleanup() {
  await prisma.invoicePayment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.user.deleteMany({ where: { username: { startsWith: 'conduce-domain-' } } });
  await prisma.customer.deleteMany({ where: { isDefault: false } });
  await prisma.invoiceSequence.update({ where: { name: 'CON' }, data: { nextValue: 1 } });
}

describe('Conduce domain migration (M2)', () => {
  afterEach(cleanup);
  afterAll(disconnectPrisma);

  it('seeds the CON- sequence and keeps historical FAC- rows with invoiceIssuedAt backfill semantics', async () => {
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'CON' } })).toMatchObject({
      name: 'CON',
      nextValue: 1,
    });

    const generic = await prisma.customer.findFirst({ where: { isDefault: true } });
    expect(generic).not.toBeNull();

    const confirmedAt = new Date('2026-08-01T12:00:00.000Z');
    const historical = await prisma.invoice.create({
      data: {
        status: 'COMPLETED',
        currency: 'DOP',
        fiscal: false,
        customerId: generic!.id,
        number: 'FAC-000600',
        ...invoiceIssuedAtFrom(confirmedAt),
        dueDate: new Date('2026-09-01T00:00:00.000Z'),
        customerName: generic!.name,
        gross: '118.00',
        base: '118.00',
        itbis: '0.00',
        ...COMPLETED_CASH_SNAPSHOT,
      },
    });
    expect(historical.conduceNumber).toBeNull();
    expect(historical.conduceIssuedAt).toBeNull();
    expect(historical.invoiceIssuedAt?.toISOString()).toBe(confirmedAt.toISOString());
    expect(historical.confirmedAt?.toISOString()).toBe(confirmedAt.toISOString());
  });

  it('allows an active conduce without FAC- and a converted COMPLETED with CON- and FAC-', async () => {
    const generic = await prisma.customer.findFirst({ where: { isDefault: true } });
    expect(generic).not.toBeNull();
    const issuedAt = new Date('2026-09-10T15:00:00.000Z');

    const active = await prisma.invoice.create({
      data: {
        status: 'CONDUCE',
        currency: 'DOP',
        fiscal: false,
        customerId: generic!.id,
        conduceNumber: 'CON-000010',
        conduceIssuedAt: issuedAt,
        confirmedAt: issuedAt,
        dueDate: new Date('2026-09-10T00:00:00.000Z'),
        customerName: generic!.name,
        gross: '118.00',
        base: '118.00',
        itbis: '0.00',
        ...COMPLETED_CASH_SNAPSHOT,
      },
    });
    expect(active).toMatchObject({
      status: 'CONDUCE',
      number: null,
      invoiceIssuedAt: null,
      conduceNumber: 'CON-000010',
    });

    const invoiceAt = new Date('2026-09-12T18:00:00.000Z');
    const converted = await prisma.invoice.create({
      data: {
        status: 'COMPLETED',
        currency: 'DOP',
        fiscal: true,
        customerId: generic!.id,
        number: 'FAC-000610',
        invoiceIssuedAt: invoiceAt,
        conduceNumber: 'CON-000011',
        conduceIssuedAt: issuedAt,
        confirmedAt: issuedAt,
        dueDate: new Date('2026-09-10T00:00:00.000Z'),
        customerName: generic!.name,
        gross: '118.00',
        base: '100.00',
        itbis: '18.00',
        ...COMPLETED_CASH_SNAPSHOT,
      },
    });
    expect(converted).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000610',
      conduceNumber: 'CON-000011',
    });
    expect(converted.invoiceIssuedAt?.toISOString()).toBe(invoiceAt.toISOString());
    expect(converted.confirmedAt?.toISOString()).toBe(issuedAt.toISOString());
  });

  it('allows a cancelled conduce without FAC- and rejects impossible combinations', async () => {
    const generic = await prisma.customer.findFirst({ where: { isDefault: true } });
    expect(generic).not.toBeNull();
    const actor = await prisma.user.create({
      data: {
        name: 'Conduce Admin',
        username: `conduce-domain-${randomUUID()}`,
        role: 'ADMINISTRATOR',
        passwordHash: 'unused',
      },
    });
    const issuedAt = new Date('2026-09-11T12:00:00.000Z');

    const cancelledConduce = await prisma.invoice.create({
      data: {
        status: 'CANCELLED',
        currency: 'DOP',
        fiscal: false,
        customerId: generic!.id,
        conduceNumber: 'CON-000020',
        conduceIssuedAt: issuedAt,
        confirmedAt: issuedAt,
        dueDate: new Date('2026-09-11T00:00:00.000Z'),
        customerName: generic!.name,
        gross: '50.00',
        base: '50.00',
        itbis: '0.00',
        cancelledAt: new Date('2026-09-12T12:00:00.000Z'),
        cancelReason: 'Cliente desistió',
        cancelledByUserId: actor.id,
        cancelledByName: actor.name,
        cancellationIdempotencyKey: `cancel-${randomUUID()}`,
        ...COMPLETED_CASH_SNAPSHOT,
      },
    });
    expect(cancelledConduce).toMatchObject({
      status: 'CANCELLED',
      number: null,
      conduceNumber: 'CON-000020',
      invoiceIssuedAt: null,
    });

    await expect(
      prisma.$executeRaw`
        INSERT INTO "Invoice" (
          "status", "currency", "fiscal", "customerId",
          "conduceNumber", "conduceIssuedAt", "confirmedAt", "dueDate",
          "customerName", "gross", "base", "itbis",
          "snapshotCustomerType", "updatedAt"
        )
        VALUES (
          'CONDUCE', 'DOP', false, ${generic!.id}::uuid,
          'CON-000030', CURRENT_TIMESTAMP, NULL, CURRENT_DATE,
          'X', 10.00, 10.00, 0.00,
          'CASH', CURRENT_TIMESTAMP
        )
      `,
    ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });

    await expect(
      prisma.$executeRaw`
        INSERT INTO "Invoice" (
          "status", "currency", "fiscal", "customerId",
          "number", "invoiceIssuedAt", "confirmedAt", "dueDate",
          "customerName", "gross", "base", "itbis",
          "snapshotCustomerType", "updatedAt"
        )
        VALUES (
          'COMPLETED', 'DOP', false, ${generic!.id}::uuid,
          'FAC-000700', NULL, CURRENT_TIMESTAMP, CURRENT_DATE,
          'X', 10.00, 10.00, 0.00,
          'CASH', CURRENT_TIMESTAMP
        )
      `,
    ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });

    await expect(
      prisma.$executeRaw`
        INSERT INTO "Invoice" (
          "status", "currency", "fiscal", "customerId",
          "conduceNumber", "conduceIssuedAt", "number", "invoiceIssuedAt",
          "confirmedAt", "dueDate", "customerName", "gross", "base", "itbis",
          "snapshotCustomerType", "updatedAt"
        )
        VALUES (
          'CONDUCE', 'DOP', false, ${generic!.id}::uuid,
          'CON-000031', CURRENT_TIMESTAMP, 'FAC-000701', CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP, CURRENT_DATE, 'X', 10.00, 10.00, 0.00,
          'CASH', CURRENT_TIMESTAMP
        )
      `,
    ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });

    await expect(
      prisma.$executeRaw`
        INSERT INTO "Invoice" (
          "status", "currency", "fiscal", "customerId", "conduceNumber", "updatedAt"
        )
        VALUES (
          'DRAFT', 'DOP', false, ${generic!.id}::uuid, 'CON-000032', CURRENT_TIMESTAMP
        )
      `,
    ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });

    await expect(
      prisma.$executeRaw`
        INSERT INTO "Invoice" (
          "status", "currency", "fiscal", "customerId",
          "conduceNumber", "conduceIssuedAt", "confirmedAt", "dueDate",
          "customerName", "gross", "base", "itbis",
          "snapshotCustomerType", "updatedAt"
        )
        VALUES (
          'CONDUCE', 'DOP', false, ${generic!.id}::uuid,
          'BAD-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_DATE,
          'X', 10.00, 10.00, 0.00,
          'CASH', CURRENT_TIMESTAMP
        )
      `,
    ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });
  });

  it('allocates unique never-reused CON- numbers under concurrency', async () => {
    const [first, second, third] = await Promise.all([
      salesTransaction(({ sales }) => sales.allocateNextConduceNumber()),
      salesTransaction(({ sales }) => sales.allocateNextConduceNumber()),
      salesTransaction(({ sales }) => sales.allocateNextConduceNumber()),
    ]);

    expect([first, second, third].sort()).toEqual(['CON-000001', 'CON-000002', 'CON-000003']);
    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'CON' } })).toMatchObject({
      nextValue: 4,
    });

    const generic = await prisma.customer.findFirst({ where: { isDefault: true } });
    expect(generic).not.toBeNull();
    const actor = await prisma.user.create({
      data: {
        name: 'Reuse Guard',
        username: `conduce-domain-${randomUUID()}`,
        role: 'ADMINISTRATOR',
        passwordHash: 'unused',
      },
    });
    const issuedAt = new Date('2026-09-13T12:00:00.000Z');
    await prisma.invoice.create({
      data: {
        status: 'CANCELLED',
        currency: 'DOP',
        fiscal: false,
        customerId: generic!.id,
        conduceNumber: 'CON-000001',
        conduceIssuedAt: issuedAt,
        confirmedAt: issuedAt,
        dueDate: new Date('2026-09-13T00:00:00.000Z'),
        customerName: generic!.name,
        gross: '10.00',
        base: '10.00',
        itbis: '0.00',
        cancelledAt: new Date('2026-09-14T12:00:00.000Z'),
        cancelReason: 'Anulado',
        cancelledByUserId: actor.id,
        cancelledByName: actor.name,
        cancellationIdempotencyKey: `cancel-${randomUUID()}`,
        ...COMPLETED_CASH_SNAPSHOT,
      },
    });

    const next = await salesTransaction(({ sales }) => sales.allocateNextConduceNumber());
    expect(next).toBe('CON-000004');
  });
});
