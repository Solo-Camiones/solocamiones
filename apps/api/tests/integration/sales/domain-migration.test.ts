import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { COMPLETED_CASH_SNAPSHOT } from '../../helpers/sales.js';

async function cleanup() {
  await prisma.invoice.deleteMany();
  await prisma.customer.deleteMany({ where: { isDefault: false } });
}

describe('Pre-production domain migration (Paso 2)', () => {
  afterEach(cleanup);
  afterAll(disconnectPrisma);

  it('backfills customers as CASH without renaming Cliente contado and seeds COT-', async () => {
    const generic = await prisma.customer.findFirst({ where: { isDefault: true } });
    expect(generic).toMatchObject({
      name: 'Cliente contado',
      customerType: 'CASH',
      creditLimitDop: null,
      creditTermDays: null,
    });

    const named = await prisma.customer.create({
      data: { name: `Taller ${randomUUID().slice(0, 8)}` },
    });
    expect(named).toMatchObject({
      customerType: 'CASH',
      creditLimitDop: null,
      creditTermDays: null,
    });
    expect(named.name.startsWith('Taller ')).toBe(true);

    expect(await prisma.invoiceSequence.findUnique({ where: { name: 'COT' } })).toMatchObject({
      name: 'COT',
      nextValue: 1,
    });
  });

  it('creates drafts with applyItbis off and keeps completed money when inserting historical rows', async () => {
    const generic = await prisma.customer.findFirst({ where: { isDefault: true } });
    expect(generic).not.toBeNull();

    const draft = await prisma.invoice.create({
      data: {
        status: 'DRAFT',
        currency: 'DOP',
        fiscal: true,
        customerId: generic!.id,
      },
    });
    expect(draft).toMatchObject({
      applyItbis: false,
      quoteNumber: null,
      snapshotCustomerType: null,
      gross: null,
    });

    const completed = await prisma.invoice.create({
      data: {
        status: 'COMPLETED',
        currency: 'DOP',
        fiscal: true,
        customerId: generic!.id,
        number: 'FAC-000500',
        confirmedAt: new Date('2026-09-01T12:00:00.000Z'),
        dueDate: new Date('2026-10-01T00:00:00.000Z'),
        customerName: generic!.name,
        gross: '118.00',
        base: '100.00',
        itbis: '18.00',
        ...COMPLETED_CASH_SNAPSHOT,
      },
    });
    expect(completed).toMatchObject({
      applyItbis: false,
      snapshotCustomerType: 'CASH',
      snapshotCreditTermDays: null,
      quoteNumber: null,
    });
    expect(completed.gross?.toFixed(2)).toBe('118.00');
    expect(completed.base?.toFixed(2)).toBe('100.00');
    expect(completed.itbis?.toFixed(2)).toBe('18.00');
  });

  it('rejects invalid cash/credit combinations at the database boundary', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Customer" ("name", "customerType", "creditLimitDop", "creditTermDays", "updatedAt")
        VALUES ('Contado con límite', 'CASH', 1000.00, 30, CURRENT_TIMESTAMP)
      `,
    ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });

    await expect(
      prisma.$executeRaw`
        INSERT INTO "Customer" ("name", "customerType", "updatedAt")
        VALUES ('Crédito incompleto', 'CREDIT', CURRENT_TIMESTAMP)
      `,
    ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });
  });

  it('stores an issued quote with frozen totals and COT- without assigning FAC-', async () => {
    const generic = await prisma.customer.findFirst({ where: { isDefault: true } });
    expect(generic).not.toBeNull();

    const issued = await prisma.invoice.create({
      data: {
        status: 'QUOTE_ISSUED',
        currency: 'DOP',
        fiscal: false,
        applyItbis: true,
        customerId: generic!.id,
        quoteNumber: 'COT-000001',
        quoteIssuedAt: new Date('2026-09-15T12:00:00.000Z'),
        quoteExpiresAt: new Date('2026-10-16T03:59:59.000Z'),
        gross: '139.24',
        base: '118.00',
        itbis: '21.24',
      },
    });
    expect(issued).toMatchObject({
      status: 'QUOTE_ISSUED',
      number: null,
      quoteNumber: 'COT-000001',
      applyItbis: true,
    });
    expect(issued.gross?.toFixed(2)).toBe('139.24');

    await expect(
      prisma.$executeRaw`
        INSERT INTO "Invoice" (
          "status", "currency", "fiscal", "customerId",
          "quoteNumber", "quoteIssuedAt", "quoteExpiresAt", "updatedAt"
        )
        VALUES (
          'QUOTE_ISSUED', 'DOP', false, ${generic!.id}::uuid,
          'COT-000002', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `,
    ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });
  });

  it('rejects a draft that already has a COT- number', async () => {
    const generic = await prisma.customer.findFirst({ where: { isDefault: true } });
    expect(generic).not.toBeNull();

    await expect(
      prisma.$executeRaw`
        INSERT INTO "Invoice" (
          "status", "currency", "fiscal", "customerId", "quoteNumber", "updatedAt"
        )
        VALUES (
          'DRAFT', 'DOP', false, ${generic!.id}::uuid, 'COT-000003', CURRENT_TIMESTAMP
        )
      `,
    ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });
  });
});
