import { Prisma, type Invoice, type InvoiceSequence } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import { businessDayRange } from '../payments/dates.js';
import { formatConduceNumber, formatInvoiceNumber, formatQuoteNumber } from './constants.js';
import type {
  CompleteInvoiceRecord,
  ConvertConduceToInvoiceRecord,
  CreateDraftInvoiceRecord,
  CreateInvoiceLineRecord,
  InvoiceListRecord,
  InvoiceRecord,
  IssueConduceRecord,
  IssueQuoteRecord,
  InvoiceSequenceRecord,
  ListInvoicesQuery,
  ListReceivablesQuery,
  ReceivablesCustomerAggregate,
  RecordInvoicePdfStatusRecord,
  RecordManualGrossProfitRecord,
  RecordUsdFxRateRecord,
  UpdateDraftInvoiceRecord,
  UpdateInvoiceLineRecord,
} from './types.js';

export const INVOICE_SEQUENCE_NAME = 'FAC';
export const QUOTE_SEQUENCE_NAME = 'COT';
export const CONDUCE_SEQUENCE_NAME = 'CON';

type SalesDatabase = Pick<Prisma.TransactionClient, 'invoice' | 'invoiceSequence' | '$queryRaw'>;

const invoiceDetailInclude = {
  customer: true,
  lines: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  payments: {
    include: { actor: true },
    orderBy: [
      { effectiveDate: 'asc' as const },
      { createdAt: 'asc' as const },
      { id: 'asc' as const },
    ],
  },
};

const invoiceListInclude = {
  customer: true,
  lines: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  payments: { orderBy: [{ effectiveDate: 'asc' as const }, { createdAt: 'asc' as const }] },
};

function listInvoiceWhere(query: ListInvoicesQuery): Prisma.InvoiceWhereInput {
  const clauses: Prisma.InvoiceWhereInput[] = [];
  if (query.status) {
    clauses.push({ status: query.status });
  }

  const q = query.q?.trim();
  if (q) {
    clauses.push({
      OR: [
        { number: { contains: q, mode: 'insensitive' } },
        { quoteNumber: { contains: q, mode: 'insensitive' } },
        { conduceNumber: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }

  if (query.dateFrom || query.dateTo) {
    const range = businessDayRange(query.dateFrom, query.dateTo);

    // Each document stage has its own business date. This keeps a mixed "Todas"
    // list useful without treating a draft creation date as an invoice issue date.
    clauses.push({
      OR: [
        { status: { in: ['COMPLETED', 'CANCELLED', 'CONDUCE'] }, confirmedAt: range },
        { status: 'QUOTE_ISSUED', quoteIssuedAt: range },
        { status: { in: ['DRAFT', 'QUOTE_DRAFT'] }, createdAt: range },
      ],
    });
  }

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0]!;
  return { AND: clauses };
}
type ReceivablePageRow = { id: string };
type ReceivableCountRow = { count: bigint };
type ReceivableCustomerRow = Omit<ReceivablesCustomerAggregate, 'invoiceCount'> & {
  invoiceCount: bigint;
};

function receivableBalances(query: ListReceivablesQuery): Prisma.Sql {
  const customerFilter = query.customerId
    ? Prisma.sql`AND i."customerId" = ${query.customerId}::uuid`
    : Prisma.empty;
  const invoiceFilter = query.invoice
    ? Prisma.sql`AND (i."number" = ${query.invoice} OR i."conduceNumber" = ${query.invoice})`
    : Prisma.empty;
  return Prisma.sql`
    WITH "paymentTotals" AS (
      SELECT
        "invoiceId",
        SUM("amount") FILTER (WHERE "kind" = 'PAYMENT')::decimal AS "paid"
      FROM "InvoicePayment"
      GROUP BY "invoiceId"
    ),
    "receivableBalances" AS (
      SELECT
        i."id",
        i."customerId",
        COALESCE(i."customerName", c."name") AS "customerName",
        i."currency",
        i."gross" AS "invoiced",
        COALESCE(p."paid", 0)::decimal AS "paid",
        (i."gross" - COALESCE(p."paid", 0))::decimal AS "balance",
        i."dueDate",
        i."confirmedAt"
      FROM "Invoice" i
      INNER JOIN "Customer" c ON c."id" = i."customerId"
      LEFT JOIN "paymentTotals" p ON p."invoiceId" = i."id"
      WHERE i."status" IN ('COMPLETED', 'CONDUCE')
        AND i."gross" > COALESCE(p."paid", 0)
        ${customerFilter}
        ${invoiceFilter}
    )
  `;
}

export class SalesRepository {
  constructor(private readonly database: SalesDatabase = prisma) {}

  createDraft(input: CreateDraftInvoiceRecord): Promise<InvoiceRecord> {
    return this.database.invoice.create({
      data: {
        status: input.status ?? 'DRAFT',
        currency: input.currency,
        fiscal: input.fiscal,
        applyItbis: input.applyItbis,
        ...(input.discountPercent !== undefined
          ? { discountPercent: input.discountPercent }
          : {}),
        customerId: input.customerId,
      },
      include: invoiceDetailInclude,
    });
  }

  duplicateAsQuoteDraft(source: InvoiceRecord): Promise<InvoiceRecord> {
    return this.database.invoice.create({
      data: {
        status: 'QUOTE_DRAFT',
        currency: source.currency,
        fiscal: source.fiscal,
        applyItbis: source.applyItbis,
        discountPercent: source.discountPercent,
        customerId: source.customerId,
        lines: {
          create: source.lines.map((line) => ({
            type: line.type,
            description: line.description,
            notes: line.notes,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            acquisitionCostDop: line.acquisitionCostDop,
            costProvenance: line.costProvenance,
            serviceId: line.serviceId,
          })),
        },
      },
      include: invoiceDetailInclude,
    });
  }

  findById(id: string): Promise<InvoiceRecord | null> {
    return this.database.invoice.findUnique({
      where: { id },
      include: invoiceDetailInclude,
    });
  }

  async list(query: ListInvoicesQuery): Promise<{
    items: InvoiceListRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const where = listInvoiceWhere(query);
    const [items, total] = await Promise.all([
      this.database.invoice.findMany({
        where,
        include: invoiceListInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.database.invoice.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async listReceivables(query: ListReceivablesQuery): Promise<{
    items: InvoiceListRecord[];
    customers: ReceivablesCustomerAggregate[];
    total: number;
  }> {
    const balances = receivableBalances(query);
    const offset = (query.page - 1) * query.pageSize;
    const [pageRows, countRows, customerRows] = await Promise.all([
      this.database.$queryRaw<ReceivablePageRow[]>`
        ${balances}
        SELECT "id"
        FROM "receivableBalances"
        ORDER BY "dueDate" ASC, "confirmedAt" ASC, "id" ASC
        LIMIT ${query.pageSize} OFFSET ${offset}
      `,
      this.database.$queryRaw<ReceivableCountRow[]>`
        ${balances}
        SELECT COUNT(*) AS "count"
        FROM "receivableBalances"
      `,
      this.database.$queryRaw<ReceivableCustomerRow[]>`
        ${balances}
        SELECT
          "customerId",
          "customerName",
          "currency",
          COUNT(*) AS "invoiceCount",
          SUM("invoiced")::decimal AS "invoiced",
          SUM("paid")::decimal AS "paid",
          SUM("balance")::decimal AS "balance"
        FROM "receivableBalances"
        WHERE "balance" > 0
        GROUP BY "customerId", "customerName", "currency"
        ORDER BY "customerName" ASC, "currency" ASC
      `,
    ]);
    const records = await this.database.invoice.findMany({
      where: { id: { in: pageRows.map((row) => row.id) } },
      include: invoiceListInclude,
    });
    const recordsById = new Map(records.map((record) => [record.id, record]));
    return {
      items: pageRows.flatMap((row) => {
        const record = recordsById.get(row.id);
        return record ? [record] : [];
      }),
      customers: customerRows.map((row) => ({
        ...row,
        invoiceCount: Number(row.invoiceCount),
      })),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  async listOpenDopInvoicesByCustomer(customerId: string) {
    const balances = receivableBalances({ customerId, page: 1, pageSize: 1 });
    const openRows = await this.database.$queryRaw<ReceivablePageRow[]>`
      ${balances}
      SELECT "id"
      FROM "receivableBalances"
      WHERE "currency" = 'DOP' AND "balance" > 0
      ORDER BY "dueDate" ASC, "confirmedAt" ASC, "id" ASC
    `;
    const invoices = await this.database.invoice.findMany({
      where: { id: { in: openRows.map((row) => row.id) } },
      select: {
        id: true,
        number: true,
        conduceNumber: true,
        confirmedAt: true,
        dueDate: true,
        status: true,
        gross: true,
        payments: {
          orderBy: [
            { effectiveDate: 'asc' },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
        },
      },
    });
    const invoicesById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    return openRows.flatMap((row) => {
      const invoice = invoicesById.get(row.id);
      return invoice ? [invoice] : [];
    });
  }

  updateDraft(id: string, input: UpdateDraftInvoiceRecord): Promise<InvoiceRecord> {
    return this.database.invoice.update({
      where: { id },
      data: {
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.fiscal !== undefined ? { fiscal: input.fiscal } : {}),
        ...(input.applyItbis !== undefined ? { applyItbis: input.applyItbis } : {}),
        ...(input.discountPercent !== undefined
          ? { discountPercent: input.discountPercent }
          : {}),
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
      },
      include: invoiceDetailInclude,
    });
  }

  deleteById(id: string): Promise<Invoice> {
    return this.database.invoice.delete({ where: { id } });
  }

  addLine(input: CreateInvoiceLineRecord): Promise<InvoiceRecord> {
    return this.database.invoice.update({
      where: { id: input.invoiceId },
      data: {
        lines: {
          create: {
            type: input.type,
            description: input.description,
            notes: input.notes ?? null,
            ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
            unitPrice: input.unitPrice,
            acquisitionCostDop: input.acquisitionCostDop ?? null,
            costProvenance: input.costProvenance ?? null,
            serviceId: input.serviceId ?? null,
          },
        },
      },
      include: invoiceDetailInclude,
    });
  }

  updateLine(input: UpdateInvoiceLineRecord): Promise<InvoiceRecord> {
    return this.database.invoice.update({
      where: { id: input.invoiceId },
      data: {
        lines: {
          update: {
            where: { id: input.lineId },
            data: {
              ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
              ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
              ...(input.description !== undefined ? { description: input.description } : {}),
              ...(input.notes !== undefined ? { notes: input.notes } : {}),
              ...(input.acquisitionCostDop !== undefined
                ? { acquisitionCostDop: input.acquisitionCostDop }
                : {}),
              ...(input.costProvenance !== undefined
                ? { costProvenance: input.costProvenance }
                : {}),
            },
          },
        },
      },
      include: invoiceDetailInclude,
    });
  }

  removeLine(invoiceId: string, lineId: string): Promise<InvoiceRecord> {
    return this.database.invoice.update({
      where: { id: invoiceId },
      data: {
        lines: {
          delete: { id: lineId },
        },
      },
      include: invoiceDetailInclude,
    });
  }

  findSequence(name = INVOICE_SEQUENCE_NAME): Promise<InvoiceSequenceRecord | null> {
    return this.database.invoiceSequence.findUnique({ where: { name } });
  }

  async lockById(id: string): Promise<void> {
    await this.database.$queryRaw`
      SELECT "id"
      FROM "Invoice"
      WHERE "id" = ${id}::uuid
      FOR UPDATE
    `;
  }

  async lockSequenceForUpdate(name = INVOICE_SEQUENCE_NAME): Promise<InvoiceSequenceRecord> {
    const rows = await this.database.$queryRaw<InvoiceSequence[]>`
      SELECT "name", "nextValue"
      FROM "InvoiceSequence"
      WHERE "name" = ${name}
      FOR UPDATE
    `;
    const sequence = rows[0];
    if (!sequence) {
      throw new Error(`Invoice sequence ${name} is missing`);
    }
    return { name: sequence.name, nextValue: Number(sequence.nextValue) };
  }

  async allocateNextNumber(name = INVOICE_SEQUENCE_NAME): Promise<string> {
    const sequence = await this.lockSequenceForUpdate(name);
    const number = formatInvoiceNumber(sequence.nextValue);
    await this.database.invoiceSequence.update({
      where: { name },
      data: { nextValue: sequence.nextValue + 1 },
    });
    return number;
  }

  async allocateNextQuoteNumber(): Promise<string> {
    const sequence = await this.lockSequenceForUpdate(QUOTE_SEQUENCE_NAME);
    const number = formatQuoteNumber(sequence.nextValue);
    await this.database.invoiceSequence.update({
      where: { name: QUOTE_SEQUENCE_NAME },
      data: { nextValue: sequence.nextValue + 1 },
    });
    return number;
  }

  async allocateNextConduceNumber(): Promise<string> {
    const sequence = await this.lockSequenceForUpdate(CONDUCE_SEQUENCE_NAME);
    const number = formatConduceNumber(sequence.nextValue);
    await this.database.invoiceSequence.update({
      where: { name: CONDUCE_SEQUENCE_NAME },
      data: { nextValue: sequence.nextValue + 1 },
    });
    return number;
  }

  issueQuote(input: IssueQuoteRecord): Promise<InvoiceRecord> {
    return this.database.invoice.update({
      where: { id: input.id },
      data: {
        status: 'QUOTE_ISSUED',
        quoteNumber: input.quoteNumber,
        quoteIssuedAt: input.quoteIssuedAt,
        quoteExpiresAt: input.quoteExpiresAt,
        customerName: input.customerName,
        customerRnc: input.customerRnc,
        customerPhone: input.customerPhone,
        quoteIssuedByUserId: input.quoteIssuedByUserId,
        quoteIssuedByName: input.quoteIssuedByName,
        gross: input.gross,
        base: input.base,
        itbis: input.itbis,
        lines: {
          update: input.lines.map((line) => ({
            where: { id: line.id },
            data: { gross: line.gross, base: line.base, itbis: line.itbis },
          })),
        },
      },
      include: invoiceDetailInclude,
    });
  }

  completeInvoice(input: CompleteInvoiceRecord): Promise<InvoiceRecord> {
    return this.database.invoice.update({
      where: { id: input.id },
      data: {
        status: 'COMPLETED',
        number: input.number,
        // Direct confirm: documentary invoice date matches commercial recognition.
        // Conduce→invoice conversion (M3) will set invoiceIssuedAt independently.
        confirmedAt: input.confirmedAt,
        invoiceIssuedAt: input.confirmedAt,
        dueDate: input.dueDate,
        customerName: input.customerName,
        customerRnc: input.customerRnc,
        customerPhone: input.customerPhone,
        snapshotCustomerType: input.snapshotCustomerType,
        snapshotCreditTermDays: input.snapshotCreditTermDays,
        confirmedByUserId: input.confirmedByUserId,
        confirmedByName: input.confirmedByName,
        gross: input.gross,
        base: input.base,
        itbis: input.itbis,
        lines: {
          update: input.lines.map((line) => ({
            where: { id: line.id },
            data: { gross: line.gross, base: line.base, itbis: line.itbis },
          })),
        },
      },
      include: invoiceDetailInclude,
    });
  }

  issueConduce(input: IssueConduceRecord): Promise<InvoiceRecord> {
    return this.database.invoice.update({
      where: { id: input.id },
      data: {
        status: 'CONDUCE',
        // Conduce documents are never fiscal; fiscal is chosen again at invoice conversion.
        fiscal: false,
        conduceNumber: input.conduceNumber,
        conduceIssuedAt: input.confirmedAt,
        confirmedAt: input.confirmedAt,
        dueDate: input.dueDate,
        customerName: input.customerName,
        customerRnc: input.customerRnc,
        customerPhone: input.customerPhone,
        snapshotCustomerType: input.snapshotCustomerType,
        snapshotCreditTermDays: input.snapshotCreditTermDays,
        confirmedByUserId: input.confirmedByUserId,
        confirmedByName: input.confirmedByName,
        gross: input.gross,
        base: input.base,
        itbis: input.itbis,
        lines: {
          update: input.lines.map((line) => ({
            where: { id: line.id },
            data: { gross: line.gross, base: line.base, itbis: line.itbis },
          })),
        },
      },
      include: invoiceDetailInclude,
    });
  }

  convertConduceToInvoice(input: ConvertConduceToInvoiceRecord): Promise<InvoiceRecord> {
    return this.database.invoice.update({
      where: { id: input.id },
      data: {
        status: 'COMPLETED',
        number: input.number,
        invoiceIssuedAt: input.invoiceIssuedAt,
        fiscal: input.fiscal,
      },
      include: invoiceDetailInclude,
    });
  }

  cancelInvoice(input: {
    id: string;
    cancelledAt: Date;
    reason: string;
    actorUserId: string;
    actorName: string;
    idempotencyKey: string;
  }): Promise<InvoiceRecord> {
    return this.database.invoice.update({
      where: { id: input.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: input.cancelledAt,
        cancelReason: input.reason,
        cancelledByUserId: input.actorUserId,
        cancelledByName: input.actorName,
        cancellationIdempotencyKey: input.idempotencyKey,
      },
      include: invoiceDetailInclude,
    });
  }

  recordManualGrossProfit(input: RecordManualGrossProfitRecord): Promise<InvoiceRecord> {
    return this.database.invoice.update({
      where: { id: input.id },
      data: {
        manualGrossProfitDop: input.profitDop,
        manualGrossProfitAt: input.recordedAt,
      },
      include: invoiceDetailInclude,
    });
  }

  async recordUsdFxRate(
    input: RecordUsdFxRateRecord,
  ): Promise<{ invoice: InvoiceRecord | null; recorded: boolean }> {
    const result = await this.database.invoice.updateMany({
      where: {
        id: input.id,
        status: { in: ['COMPLETED', 'CONDUCE'] },
        currency: 'USD',
        exchangeRateDopPerUsd: null,
      },
      data: {
        exchangeRateDopPerUsd: input.exchangeRateDopPerUsd,
        fxRateSource: input.source,
        fxRateUpdatedAt: input.rateUpdatedAt,
        fxRateObtainedAt: input.obtainedAt,
      },
    });
    return { invoice: await this.findById(input.id), recorded: result.count > 0 };
  }

  async recordPdfStatus(
    input: RecordInvoicePdfStatusRecord,
  ): Promise<{ invoice: InvoiceRecord | null; recorded: boolean }> {
    const result = await this.database.invoice.updateMany({
      where: {
        id: input.id,
        status: { in: ['COMPLETED', 'CANCELLED'] },
        pdfStatus: input.currentPdfStatus,
      },
      data: {
        pdfStatus: input.status,
        pdfErrorId: input.errorId,
        pdfGeneratedAt: input.generatedAt,
        pdfTemplateVersion: input.templateVersion,
      },
    });
    return { invoice: await this.findById(input.id), recorded: result.count > 0 };
  }
}
