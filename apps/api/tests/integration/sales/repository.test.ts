import { randomUUID } from 'node:crypto';

import { InvoiceCurrency, InvoiceLineType, CostProvenance } from '@prisma/client';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { CatalogRepository } from '../../../src/features/catalogs/repository.js';
import { CustomerRepository } from '../../../src/features/customers/repository.js';
import { DUPLICATE_DELIVERY_LINE_MESSAGE } from '../../../src/features/sales/constants.js';
import { SalesRepository } from '../../../src/features/sales/repository.js';
import { salesTransaction } from '../../../src/features/sales/transaction.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';

const sales = new SalesRepository();
const customers = new CustomerRepository();
const catalog = new CatalogRepository();

async function cleanupSales() {
  await prisma.invoicePayment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.mechanicalService.deleteMany();
  await prisma.user.deleteMany({ where: { username: { startsWith: 'repo-quote-' } } });
  await prisma.invoiceSequence.update({
    where: { name: 'FAC' },
    data: { nextValue: 1 },
  });
}

describe('SalesRepository (PostgreSQL)', () => {
  afterEach(cleanupSales);
  afterAll(disconnectPrisma);

  it('creates a draft without a FAC- number and stores DOP or USD', async () => {
    const customer = await customers.findDefault();
    expect(customer).not.toBeNull();

    const dop = await sales.createDraft({
      customerId: customer!.id,
      currency: InvoiceCurrency.DOP,
      fiscal: false,
      applyItbis: false,
    });
    const usd = await sales.createDraft({
      customerId: customer!.id,
      currency: InvoiceCurrency.USD,
      fiscal: true,
      applyItbis: false,
    });

    expect(dop).toMatchObject({
      status: 'DRAFT',
      currency: InvoiceCurrency.DOP,
      fiscal: false,
      number: null,
      customerId: customer!.id,
      lines: [],
    });
    expect(usd).toMatchObject({
      status: 'DRAFT',
      currency: InvoiceCurrency.USD,
      fiscal: true,
      number: null,
    });
    expect(await sales.findById(dop.id)).toEqual(dop);
  });

  it('seeds the FAC sequence at nextValue 1 and can lock it without consuming', async () => {
    expect(await sales.findSequence()).toMatchObject({ name: 'FAC', nextValue: 1 });

    await prisma.$transaction(async (tx) => {
      const locked = await new SalesRepository(tx).lockSequenceForUpdate();
      expect(locked).toEqual({ name: 'FAC', nextValue: 1 });
    });

    expect(await sales.findSequence()).toMatchObject({ name: 'FAC', nextValue: 1 });
  });

  it('allocates FAC-000001 from the locked sequence and persists confirmation money', async () => {
    const customer = await customers.findDefault();
    const draft = await sales.createDraft({
      customerId: customer!.id,
      currency: InvoiceCurrency.DOP,
      fiscal: false,
      applyItbis: false,
    });
    const withLine = await sales.addLine({
      invoiceId: draft.id,
      type: InvoiceLineType.GENERIC,
      description: 'Filtro',
      unitPrice: '118.00',
      costProvenance: CostProvenance.UNKNOWN,
    });

    const completed = await prisma.$transaction(async (tx) => {
      const transactional = new SalesRepository(tx);
      const number = await transactional.allocateNextNumber();
      expect(number).toBe('FAC-000001');
      return transactional.completeInvoice({
        id: withLine.id,
        number,
        confirmedAt: new Date('2026-09-08T18:00:00.000Z'),
        dueDate: new Date('2026-10-08T00:00:00.000Z'),
        customerName: customer!.name,
        customerRnc: customer!.rnc,
        customerPhone: null,
        confirmedByUserId: null,
        confirmedByName: null,
        snapshotCustomerType: 'CASH',
        snapshotCreditTermDays: null,
        gross: '118.00',
        base: '118.00',
        itbis: '0.00',
        lines: [
          {
            id: withLine.lines[0]!.id,
            gross: '118.00',
            base: '118.00',
            itbis: '0.00',
          },
        ],
      });
    });

    expect(completed).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000001',
      customerName: customer!.name,
      customerRnc: null,
    });
    expect(completed.confirmedAt?.toISOString()).toBe('2026-09-08T18:00:00.000Z');
    expect(Number(completed.gross)).toBe(118);
    expect(Number(completed.lines[0]?.gross)).toBe(118);
    expect(await sales.findSequence()).toMatchObject({ name: 'FAC', nextValue: 2 });
  });

  it('persists GENERIC cost-actual, SERVICE, and EXTERNAL lines on a draft', async () => {
    const customer = await customers.findDefault();
    const service = await catalog.create({ name: 'Instalación mecánica' });
    const draft = await sales.createDraft({
      customerId: customer!.id,
      currency: InvoiceCurrency.DOP,
      fiscal: false,
      applyItbis: false,
    });

    const withGeneric = await sales.addLine({
      invoiceId: draft.id,
      type: InvoiceLineType.GENERIC,
      description: 'Filtro genérico',
      quantity: '2',
      unitPrice: '150.5',
      costProvenance: CostProvenance.ACTUAL,
      acquisitionCostDop: '80',
    });
    const withService = await sales.addLine({
      invoiceId: draft.id,
      type: InvoiceLineType.SERVICE,
      description: 'Instalación mecánica',
      unitPrice: '0',
      serviceId: service.id,
    });

    expect(withGeneric.lines).toHaveLength(1);
    expect(withGeneric.lines[0]).toMatchObject({
      type: InvoiceLineType.GENERIC,
      description: 'Filtro genérico',
      costProvenance: CostProvenance.ACTUAL,
    });
    expect(Number(withGeneric.lines[0]?.quantity)).toBe(2);
    expect(Number(withGeneric.lines[0]?.unitPrice)).toBe(150.5);
    expect(Number(withGeneric.lines[0]?.acquisitionCostDop)).toBe(80);

    expect(withService.lines).toHaveLength(2);
    expect(withService.lines[1]).toMatchObject({
      type: InvoiceLineType.SERVICE,
      serviceId: service.id,
      costProvenance: null,
      acquisitionCostDop: null,
    });
    expect(Number(withService.lines[1]?.quantity)).toBe(1);
    expect(Number(withService.lines[1]?.unitPrice)).toBe(0);

    const withExternal = await sales.addLine({
      invoiceId: draft.id,
      type: InvoiceLineType.EXTERNAL,
      description: 'Bomba externa',
      unitPrice: '300',
      costProvenance: CostProvenance.UNKNOWN,
    });
    expect(withExternal.lines).toHaveLength(3);
    expect(withExternal.lines[2]).toMatchObject({
      type: InvoiceLineType.EXTERNAL,
      description: 'Bomba externa',
      costProvenance: CostProvenance.UNKNOWN,
      acquisitionCostDop: null,
      serviceId: null,
    });
    expect(Number(withExternal.lines[2]?.quantity)).toBe(1);
  });

  it('requires a DELIVERY description and maps the unique constraint to a conflict', async () => {
    const customer = await customers.findDefault();
    const draft = await sales.createDraft({
      customerId: customer!.id,
      currency: InvoiceCurrency.DOP,
      fiscal: false,
      applyItbis: false,
    });

    await expect(
      sales.addLine({
        invoiceId: draft.id,
        type: InvoiceLineType.DELIVERY,
        description: '',
        unitPrice: '0',
      }),
    ).rejects.toThrow(/InvoiceLine_description_check|check constraint/);

    const withDelivery = await sales.addLine({
      invoiceId: draft.id,
      type: InvoiceLineType.DELIVERY,
      description: 'Entrega incluida',
      unitPrice: '0',
    });
    expect(withDelivery.lines).toHaveLength(1);
    expect(withDelivery.lines[0]).toMatchObject({
      type: InvoiceLineType.DELIVERY,
      description: 'Entrega incluida',
    });
    expect(Number(withDelivery.lines[0]?.unitPrice)).toBe(0);

    await expect(
      salesTransaction(({ sales: transactionalSales }) =>
        transactionalSales.addLine({
          invoiceId: draft.id,
          type: InvoiceLineType.DELIVERY,
          description: 'Envío',
          unitPrice: '200',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: DUPLICATE_DELIVERY_LINE_MESSAGE,
    });
  });

  it('rejects UNKNOWN cost stored as zero at the database', async () => {
    const customer = await customers.findDefault();
    const draft = await sales.createDraft({
      customerId: customer!.id,
      currency: InvoiceCurrency.DOP,
      fiscal: false,
      applyItbis: false,
    });

    await expect(
      sales.addLine({
        invoiceId: draft.id,
        type: InvoiceLineType.GENERIC,
        description: 'Costo desconocido',
        unitPrice: '10',
        costProvenance: CostProvenance.UNKNOWN,
        acquisitionCostDop: '0',
      }),
    ).rejects.toThrow(/InvoiceLine_cost_check/);
  });

  it('rejects a SERVICE line without a catalog service at the database', async () => {
    const customer = await customers.findDefault();
    const draft = await sales.createDraft({
      customerId: customer!.id,
      currency: InvoiceCurrency.DOP,
      fiscal: false,
      applyItbis: false,
    });

    await expect(
      sales.addLine({
        invoiceId: draft.id,
        type: InvoiceLineType.SERVICE,
        description: 'Servicio sin catálogo',
        unitPrice: '100',
      }),
    ).rejects.toThrow(/InvoiceLine_serviceId_required_check/);
  });

  // Calendar days for list filters are Santo Domingo (-04:00), not UTC midnight.
  const FILTER_DAY = '2026-03-10';
  const FILTER_NEXT_DAY = '2026-03-11';
  const FILTER_RANGE = { page: 1, pageSize: 20, dateFrom: FILTER_DAY, dateTo: FILTER_DAY };
  const START_OF_FILTER_DAY = new Date(`${FILTER_DAY}T00:00:00-04:00`);
  const END_OF_FILTER_DAY = new Date(`${FILTER_DAY}T23:59:59.999-04:00`);
  const END_OF_PREVIOUS_DAY = new Date('2026-03-09T23:59:59.999-04:00');

  async function createEmptyDraft(customerId: string, status?: 'DRAFT' | 'QUOTE_DRAFT') {
    return sales.createDraft({
      customerId,
      currency: InvoiceCurrency.DOP,
      fiscal: false,
      applyItbis: false,
      ...(status ? { status } : {}),
    });
  }

  async function completeAt(input: {
    id: string;
    customerName: string;
    confirmedAt: Date;
    number: string;
  }) {
    return sales.completeInvoice({
      id: input.id,
      number: input.number,
      confirmedAt: input.confirmedAt,
      dueDate: new Date('2026-04-10T00:00:00.000Z'),
      customerName: input.customerName,
      customerRnc: null,
      customerPhone: null,
      confirmedByUserId: null,
      confirmedByName: null,
      snapshotCustomerType: 'CASH',
      snapshotCreditTermDays: null,
      gross: '0.00',
      base: '0.00',
      itbis: '0.00',
      lines: [],
    });
  }

  it('lists completed invoices by Santo Domingo confirmedAt, including midnight bounds', async () => {
    const customer = await customers.findDefault();
    const includedStart = await createEmptyDraft(customer!.id);
    const includedEnd = await createEmptyDraft(customer!.id);
    const previousDay = await createEmptyDraft(customer!.id);

    await completeAt({
      id: includedStart.id,
      customerName: customer!.name,
      confirmedAt: START_OF_FILTER_DAY,
      number: 'FAC-DATE-001',
    });
    await completeAt({
      id: includedEnd.id,
      customerName: customer!.name,
      confirmedAt: END_OF_FILTER_DAY,
      number: 'FAC-DATE-002',
    });
    await completeAt({
      id: previousDay.id,
      customerName: customer!.name,
      confirmedAt: END_OF_PREVIOUS_DAY,
      number: 'FAC-DATE-003',
    });

    const page = await sales.list(FILTER_RANGE);
    const ids = page.items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([includedStart.id, includedEnd.id]));
    expect(ids).not.toContain(previousDay.id);
    expect(page.total).toBe(2);
  });

  it('uses document-stage dates on mixed ALL lists so completed createdAt cannot leak in', async () => {
    const customer = await customers.findDefault();
    const draftInRange = await createEmptyDraft(customer!.id);
    const completedOutside = await createEmptyDraft(customer!.id);

    await prisma.invoice.update({
      where: { id: draftInRange.id },
      data: { createdAt: START_OF_FILTER_DAY },
    });
    await prisma.invoice.update({
      where: { id: completedOutside.id },
      data: { createdAt: START_OF_FILTER_DAY },
    });
    await completeAt({
      id: completedOutside.id,
      customerName: customer!.name,
      confirmedAt: END_OF_PREVIOUS_DAY,
      number: 'FAC-DATE-010',
    });

    const page = await sales.list(FILTER_RANGE);
    const ids = page.items.map((item) => item.id);
    expect(ids).toContain(draftInRange.id);
    expect(ids).not.toContain(completedOutside.id);
    expect(page.total).toBe(1);
  });

  it('matches QUOTE_ISSUED on quoteIssuedAt instead of the draft createdAt', async () => {
    const customer = await customers.findDefault();
    const quote = await createEmptyDraft(customer!.id, 'QUOTE_DRAFT');
    await prisma.invoice.update({
      where: { id: quote.id },
      data: { createdAt: START_OF_FILTER_DAY },
    });
    const issuer = await prisma.user.create({
      data: {
        name: 'Quote Issuer',
        username: `repo-quote-${randomUUID()}`,
        role: 'SELLER',
        passwordHash: 'unused',
      },
    });
    await sales.issueQuote({
      id: quote.id,
      quoteNumber: 'COT-000001',
      quoteIssuedAt: new Date(`${FILTER_NEXT_DAY}T08:00:00-04:00`),
      quoteExpiresAt: new Date(`${FILTER_NEXT_DAY}T23:59:59.999-04:00`),
      customerName: customer!.name,
      customerRnc: null,
      customerPhone: null,
      quoteIssuedByUserId: issuer.id,
      quoteIssuedByName: issuer.name,
      gross: '0.00',
      base: '0.00',
      itbis: '0.00',
      lines: [],
    });

    const onDraftDay = await sales.list(FILTER_RANGE);
    expect(onDraftDay.items.map((item) => item.id)).not.toContain(quote.id);
    expect(onDraftDay.total).toBe(0);

    const onIssueDay = await sales.list({
      page: 1,
      pageSize: 20,
      dateFrom: FILTER_NEXT_DAY,
      dateTo: FILTER_NEXT_DAY,
    });
    expect(onIssueDay.items.map((item) => item.id)).toContain(quote.id);
    expect(onIssueDay.total).toBe(1);
  });
});
