import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { prisma } from '../../../infrastructure/database/index.js';
import { UserRepository } from '../../users/repository.js';
import { CustomerRepository } from '../../customers/repository.js';

const CASH_SNAPSHOT = {
  snapshotCustomerType: 'CASH' as const,
  snapshotCreditTermDays: null,
};

export type EvalFixtures = {
  adminUserId: string;
  placeholders: Record<string, string>;
  /** IDs created by this seed for cleanup. */
  created: {
    userId: string;
    customerIds: string[];
    invoiceIds: string[];
  };
};

/**
 * Deterministic commercial fixtures for live/hybrid eval cases (decision 6A).
 * Uses high CON-/FAC-/COT- numbers to reduce collision with demo data.
 */
export async function seedEvalFixtures(): Promise<EvalFixtures> {
  const users = new UserRepository();
  const customers = new CustomerRepository();
  const suffix = randomUUID().slice(0, 8);
  const rncCash = `131${Date.now().toString().slice(-6)}`;
  const rncCredit = `001${(Date.now() + 1).toString().slice(-8)}`;

  const admin = await users.create({
    name: `Eval Admin ${suffix}`,
    username: `eval-admin-${suffix}`,
    role: 'ADMINISTRATOR',
    passwordHash: 'eval-fixture-unused',
  });

  const cash = await customers.create({
    name: `Eval Taller Cash ${suffix}`,
    rnc: rncCash,
    address: 'secret-address-eval',
    notes: 'secret-notes-eval',
    customerType: 'CASH',
    contacts: [
      {
        name: 'Contacto Eval',
        phone: '8095550101',
        email: 'eval-secret@example.com',
        isPrimary: true,
      },
    ],
  });

  const credit = await customers.create({
    name: `Eval Credito ${suffix}`,
    rnc: rncCredit,
    customerType: 'CREDIT',
    creditLimitDop: '25000.00',
    creditTermDays: 30,
  });

  const issuedAt = new Date('2026-09-20T15:00:00.000Z');
  // Document numbers must match ^COT-/CON-/FAC-[0-9]{6}$
  const serial = String(Date.now() % 1_000_000).padStart(6, '0');
  const quoteNumber = `COT-${serial}`;
  const conduceNumber = `CON-${serial}`;
  const invoiceSerial = String((Date.now() + 1) % 1_000_000).padStart(6, '0');
  const invoiceNumber = `FAC-${invoiceSerial}`;
  const invoiceConduceNumber = `CON-${invoiceSerial}`;

  const quote = await prisma.invoice.create({
    data: {
      status: 'QUOTE_ISSUED',
      currency: 'DOP',
      fiscal: false,
      customerId: cash.id,
      quoteNumber,
      quoteIssuedAt: issuedAt,
      quoteExpiresAt: new Date('2026-10-20T15:00:00.000Z'),
      quoteIssuedByUserId: admin.id,
      quoteIssuedByName: admin.name,
      customerName: cash.name,
      gross: '1180.00',
      base: '1000.00',
      itbis: '180.00',
    },
  });

  const conduce = await prisma.invoice.create({
    data: {
      status: 'CONDUCE',
      currency: 'DOP',
      fiscal: false,
      customerId: cash.id,
      conduceNumber,
      conduceIssuedAt: issuedAt,
      confirmedAt: issuedAt,
      dueDate: new Date('2026-09-20T00:00:00.000Z'),
      customerName: cash.name,
      gross: '1180.00',
      base: '1000.00',
      itbis: '180.00',
      confirmedByUserId: admin.id,
      confirmedByName: admin.name,
      ...CASH_SNAPSHOT,
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      status: 'COMPLETED',
      currency: 'DOP',
      fiscal: true,
      applyItbis: true,
      customerId: credit.id,
      number: invoiceNumber,
      invoiceIssuedAt: issuedAt,
      conduceNumber: invoiceConduceNumber,
      conduceIssuedAt: issuedAt,
      confirmedAt: issuedAt,
      dueDate: new Date('2026-10-20T00:00:00.000Z'),
      customerName: credit.name,
      gross: '2360.00',
      base: '2000.00',
      itbis: '360.00',
      confirmedByUserId: admin.id,
      confirmedByName: admin.name,
      snapshotCustomerType: 'CREDIT',
      snapshotCreditTermDays: 30,
    },
  });

  await prisma.invoiceLine.create({
    data: {
      invoiceId: invoice.id,
      type: 'GENERIC',
      description: 'Servicio eval generico',
      quantity: 1,
      unitPrice: '2000.00',
      gross: '2360.00',
      base: '2000.00',
      itbis: '360.00',
    },
  });

  const placeholders: Record<string, string> = {
    adminUserId: admin.id,
    customerCashId: cash.id,
    customerCashName: cash.name,
    customerCreditId: credit.id,
    customerCreditName: credit.name,
    quoteId: quote.id,
    quoteNumber,
    conduceId: conduce.id,
    conduceNumber,
    invoiceId: invoice.id,
    invoiceNumber,
    profitabilityDateFrom: '2026-09-01',
    profitabilityDateTo: '2026-09-30',
  };

  return {
    adminUserId: admin.id,
    placeholders,
    created: {
      userId: admin.id,
      customerIds: [cash.id, credit.id],
      invoiceIds: [quote.id, conduce.id, invoice.id],
    },
  };
}

const COMMERCIAL_TABLES = [
  'Customer',
  'CustomerContact',
  'MechanicalService',
  'Invoice',
  'InvoiceLine',
  'InvoicePayment',
  'InvoiceSequence',
  'HistoryEvent',
] as const;

type CommercialTable = (typeof COMMERCIAL_TABLES)[number];

export type CommercialSnapshotEntry = {
  rowCount: number;
  fingerprint: string;
};

export type CommercialSnapshot = Record<CommercialTable, CommercialSnapshotEntry>;

type CommercialSnapshotRow = {
  tableName: CommercialTable;
  rowCount: bigint;
  fingerprint: string;
};

function commercialTableSnapshot(
  tableName: CommercialTable,
  orderColumn: 'id' | 'name',
): Prisma.Sql {
  return Prisma.sql`
    SELECT
      ${tableName}::text AS "tableName",
      COUNT(*)::bigint AS "rowCount",
      md5(COALESCE(jsonb_agg(to_jsonb(record) ORDER BY ${Prisma.raw(`record."${orderColumn}"`)})::text, '[]')) AS fingerprint
    FROM ${Prisma.raw(`"${tableName}"`)} AS record
  `;
}

/**
 * Captures commercial state without transferring row contents to the eval process.
 * Count catches inserts/deletes; the stable PostgreSQL-side digest also catches updates.
 */
export async function captureCommercialSnapshot(): Promise<CommercialSnapshot> {
  const queries = COMMERCIAL_TABLES.map((tableName) =>
    commercialTableSnapshot(tableName, tableName === 'InvoiceSequence' ? 'name' : 'id'),
  );
  const rows = await prisma.$queryRaw<CommercialSnapshotRow[]>(Prisma.join(queries, ' UNION ALL '));

  return Object.fromEntries(
    rows.map((row) => [
      row.tableName,
      { rowCount: Number(row.rowCount), fingerprint: row.fingerprint },
    ]),
  ) as CommercialSnapshot;
}

export function diffCommercialSnapshots(
  before: CommercialSnapshot,
  after: CommercialSnapshot,
): CommercialTable[] {
  return COMMERCIAL_TABLES.filter(
    (tableName) =>
      before[tableName].rowCount !== after[tableName].rowCount ||
      before[tableName].fingerprint !== after[tableName].fingerprint,
  );
}

/**
 * Best-effort cleanup of eval-owned rows. Does not delete the default customer.
 */
export async function cleanupEvalFixtures(fixtures: EvalFixtures): Promise<void> {
  await prisma.assistantConversation.deleteMany({
    where: { userId: fixtures.created.userId },
  });
  await prisma.invoicePayment.deleteMany({
    where: { invoiceId: { in: fixtures.created.invoiceIds } },
  });
  await prisma.invoiceLine.deleteMany({
    where: { invoiceId: { in: fixtures.created.invoiceIds } },
  });
  await prisma.invoice.deleteMany({
    where: { id: { in: fixtures.created.invoiceIds } },
  });
  await prisma.customerContact.deleteMany({
    where: { customerId: { in: fixtures.created.customerIds } },
  });
  await prisma.customer.deleteMany({
    where: { id: { in: fixtures.created.customerIds } },
  });
  await prisma.user.deleteMany({
    where: { id: fixtures.created.userId },
  });
}
