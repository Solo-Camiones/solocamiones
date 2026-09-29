import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  ASSISTANT_FORBIDDEN_OUTPUT_KEYS,
  createCommercialAssistantToolRegistry,
} from '../../../src/features/assistant/tools/index.js';
import { CustomerRepository } from '../../../src/features/customers/repository.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { AppError } from '../../../src/infrastructure/errors/app-error.js';

const users = new UserRepository();
const customers = new CustomerRepository();

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}

async function createUser(role: 'ADMINISTRATOR' | 'SELLER' | 'MECHANIC') {
  return users.create({
    name: `${role} assistant tools`,
    username: `asst-tools-${role.toLowerCase()}-${randomUUID()}`,
    role,
    passwordHash: 'assistant-tools-fixture',
  });
}

describe('Assistant commercial tools (PostgreSQL)', () => {
  afterEach(async () => {
    await prisma.invoicePayment.deleteMany();
    await prisma.invoiceLine.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.customerContact.deleteMany({ where: { customer: { isDefault: false } } });
    await prisma.customer.deleteMany({ where: { isDefault: false } });
    await prisma.user.deleteMany();
  });

  afterAll(disconnectPrisma);

  it('searchCustomers returns allowlisted fields and rejects Seller', async () => {
    const admin = await createUser('ADMINISTRATOR');
    const seller = await createUser('SELLER');
    const created = await customers.create({
      name: `Taller Assistant ${randomUUID().slice(0, 8)}`,
      rnc: '131999001',
      notes: 'secret-notes',
      address: 'secret-address',
      contacts: [{ name: 'Ana', phone: '8090000000', email: 'a@x.com', isPrimary: true }],
    });

    const registry = createCommercialAssistantToolRegistry();
    const result = (await registry.execute(
      'searchCustomers',
      { query: created.name, limit: 5 },
      { actorId: admin.id },
    )) as {
      items: Array<Record<string, unknown>>;
      sourceKey: string;
    };

    expect(result.sourceKey).toBe('tool:searchCustomers');
    expect(result.items.some((item) => item.id === created.id)).toBe(true);
    const keys = collectKeys(result);
    for (const forbidden of ASSISTANT_FORBIDDEN_OUTPUT_KEYS) {
      expect(keys.has(forbidden)).toBe(false);
    }

    await expect(
      registry.execute('searchCustomers', { query: created.name }, { actorId: seller.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<AppError>);
  });

  it('getCustomerCommercialSummary includes credit aggregates without PII', async () => {
    const admin = await createUser('ADMINISTRATOR');
    const credit = await customers.create({
      name: `Credito Assistant ${randomUUID().slice(0, 8)}`,
      rnc: '00199887766',
      customerType: 'CREDIT',
      creditLimitDop: '10000.00',
      creditTermDays: 30,
    });

    const registry = createCommercialAssistantToolRegistry();
    const summary = (await registry.execute(
      'getCustomerCommercialSummary',
      { customerId: credit.id },
      { actorId: admin.id },
    )) as Record<string, unknown>;

    expect(summary).toMatchObject({
      id: credit.id,
      customerType: 'CREDIT',
      creditLimitDop: '10000.00',
      creditTermDays: 30,
      openDocumentCount: 0,
      sourceKey: 'tool:getCustomerCommercialSummary',
      appPath: '/customers',
    });
    expect(summary).toHaveProperty('creditExposureUsedDop');
    expect(summary).toHaveProperty('creditRemainingDop');
    const keys = collectKeys(summary);
    for (const forbidden of ASSISTANT_FORBIDDEN_OUTPUT_KEYS) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it('getReceivablesSummary aggregates every matching document while limiting stubs', async () => {
    const admin = await createUser('ADMINISTRATOR');
    const credit = await customers.create({
      name: `CxC Assistant ${randomUUID().slice(0, 8)}`,
      rnc: '131700000',
      customerType: 'CREDIT',
      creditLimitDop: '10000.00',
      creditTermDays: 30,
    });
    const confirmedAt = new Date('2026-01-01T16:00:00.000Z');

    await prisma.invoice.createMany({
      data: Array.from({ length: 205 }, (_, index) => ({
        status: 'COMPLETED' as const,
        currency: 'DOP' as const,
        fiscal: false,
        customerId: credit.id,
        number: `FAC-${String(700_000 + index).padStart(6, '0')}`,
        confirmedAt,
        invoiceIssuedAt: confirmedAt,
        dueDate: new Date('2026-02-01T00:00:00.000Z'),
        customerName: credit.name,
        snapshotCustomerType: 'CREDIT' as const,
        snapshotCreditTermDays: 30,
        confirmedByUserId: admin.id,
        confirmedByName: admin.name,
        gross: '10.00',
        base: '10.00',
        itbis: '0.00',
      })),
    });

    const registry = createCommercialAssistantToolRegistry();
    const summary = (await registry.execute(
      'getReceivablesSummary',
      { customerId: credit.id, type: 'FAC', limit: 20 },
      { actorId: admin.id, now: new Date('2026-01-15T16:00:00.000Z') },
    )) as {
      aggregates: Record<string, unknown>;
      documents: unknown[];
    };

    expect(summary.aggregates).toEqual({
      documentCount: 205,
      invoicedDop: '2050.00',
      paidDop: '0.00',
      balanceDop: '2050.00',
      invoicedUsd: '0.00',
      paidUsd: '0.00',
      balanceUsd: '0.00',
    });
    expect(summary.documents).toHaveLength(20);
  });

  it('getProfitabilitySummary rejects ranges over 366 days at the registry', async () => {
    const admin = await createUser('ADMINISTRATOR');
    const registry = createCommercialAssistantToolRegistry();
    await expect(
      registry.execute(
        'getProfitabilitySummary',
        { dateFrom: '2025-01-01', dateTo: '2026-01-02', currency: 'DOP' },
        { actorId: admin.id },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('returns empty search and not-found detail safely', async () => {
    const admin = await createUser('ADMINISTRATOR');
    const registry = createCommercialAssistantToolRegistry();
    const empty = (await registry.execute(
      'searchSalesDocuments',
      { query: `NO-MATCH-${randomUUID()}`, limit: 5 },
      { actorId: admin.id },
    )) as { items: unknown[] };
    expect(empty.items).toEqual([]);

    await expect(
      registry.execute(
        'getSalesDocumentDetail',
        { documentId: randomUUID() },
        { actorId: admin.id },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
