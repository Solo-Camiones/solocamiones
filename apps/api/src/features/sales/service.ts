import { Prisma, type InvoiceLineType, type InvoiceStatus } from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { unavailableFxRateProvider, type FxRateProvider } from '../../infrastructure/fx/index.js';
import { logger } from '../../infrastructure/logging/index.js';
import { CatalogRepository } from '../catalogs/repository.js';
import { satisfiesFiscalIdentity } from '../customers/fiscal.js';
import { InvoiceDocumentService } from '../invoice-documents/service.js';
import {
  databaseDate,
  databaseDateString,
  businessDateString,
  invoiceDueDate,
  todayBusinessDate,
} from '../payments/dates.js';
import { summarizePayments } from '../payments/summary.js';
import { toInvoiceHistoryEntries } from '../history/invoice-timeline.js';
import { assertAdministrator } from '../users/policies.js';
import {
  CATALOG_SERVICE_NOT_FOUND_MESSAGE,
  DEFAULT_DRAFT_CURRENCY,
  DRAFT_ONLY_CONFIRM_MESSAGE,
  DRAFT_ONLY_DISCARD_MESSAGE,
  DRAFT_ONLY_EDIT_MESSAGE,
  DRAFT_ONLY_ISSUE_CONDUCE_MESSAGE,
  DUPLICATE_DELIVERY_LINE_MESSAGE,
  EMPTY_DRAFT_CONFIRM_MESSAGE,
  FISCAL_IDENTITY_REQUIRED_MESSAGE,
  INACTIVE_SERVICE_LINE_MESSAGE,
  LINE_NOT_FOUND_MESSAGE,
  MISSING_GENERIC_CUSTOMER_MESSAGE,
  PAYMENT_COMPLETED_ONLY_MESSAGE,
  PAYMENT_DATE_RANGE_MESSAGE,
  PAYMENT_EXCEEDS_BALANCE_MESSAGE,
  PAYMENT_IDEMPOTENCY_MISMATCH_MESSAGE,
  CANCELLATION_COMPLETED_ONLY_MESSAGE,
  CANCELLATION_REASON_REQUIRED_MESSAGE,
  CANCELLATION_REFUND_AMOUNT_REQUIRED_MESSAGE,
  CANCELLATION_REFUND_EXCEEDS_NET_MESSAGE,
  CANCELLATION_REFUND_METHOD_REQUIRED_MESSAGE,
  CONDUCE_FISCAL_RETRY_MISMATCH_MESSAGE,
  CONDUCE_ONLY_CONVERT_TO_INVOICE_MESSAGE,
  EXPIRED_QUOTE_CONVERT_MESSAGE,
  QUOTE_DRAFT_ONLY_ISSUE_MESSAGE,
  QUOTE_ISSUED_ONLY_CONVERT_MESSAGE,
  QUOTE_ISSUED_ONLY_CONVERT_TO_CONDUCE_MESSAGE,
  QUOTE_ISSUED_ONLY_DUPLICATE_MESSAGE,
} from './constants.js';
import { DEFAULT_LINE_QUANTITY } from './money/constants.js';
import { calculateLineMoney, parsePositiveDecimal, applyInvoiceDiscount, isTaxableLineType } from './money/index.js';
import {
  assertConduceInitialPaymentPolicy,
  assertCreditExposureWithinLimit,
  assertInitialPaymentPolicy,
  confirmationDueTermDays,
  confirmationPaymentIdempotencyKey,
  invoiceNewBalance,
  resolveConduceDueDate,
} from './credit-confirmation.js';
import {
  assertDraftLineDescriptionEditable,
  assertDraftLineQuantityEditable,
  assertDraftLineTypeEnabled,
  requireInvoiceManager,
} from './policies.js';
import {
  toConfirmedHistorySnapshot,
  toConduceIssuedHistorySnapshot,
  toDraftHistorySnapshot,
  toPublicInvoice,
  toPublicInvoiceListItem,
  toPublicReceivables,
  toUsdFxRecordedHistorySnapshot,
} from './projection.js';
import { SalesRepository } from './repository.js';
import { isQuoteExpired, quoteExpirationDate } from './quote-dates.js';
import { salesTransaction, type SalesTransaction } from './transaction.js';
import type { CreateInvoiceLineRecord, InvoiceRecord } from './types.js';
import {
  addInvoiceLineSchema,
  addPaymentSchema,
  cancelInvoiceSchema,
  confirmInvoiceSchema,
  convertConduceToInvoiceSchema,
  createDraftSchema,
  deliveryDraftLineSchema,
  externalDraftLineSchema,
  genericDraftLineSchema,
  invoiceIdSchema,
  invoiceLineIdSchema,
  issueConduceSchema,
  listInvoicesSchema,
  listReceivablesSchema,
  serviceDraftLineSchema,
  setLinePriceSchema,
  updateDraftMetaSchema,
} from './validation.js';

type DraftLineWrite = Omit<CreateInvoiceLineRecord, 'invoiceId'>;

function assertEditableStatus(status: InvoiceStatus, message: string): void {
  if (status !== 'DRAFT' && status !== 'QUOTE_DRAFT') throw AppError.conflict(message);
}

function assertFiscalCustomer(
  customer: { isDefault: boolean; rnc: string | null },
  fiscal: boolean,
): void {
  if (fiscal && !satisfiesFiscalIdentity(customer)) {
    throw AppError.conflict(FISCAL_IDENTITY_REQUIRED_MESSAGE);
  }
}

function toMerchandiseDraftLine(profile: {
  type: 'GENERIC' | 'EXTERNAL';
  description: string;
  notes?: string | null;
  quantity?: string;
  unitPrice: string;
}): DraftLineWrite {
  const quantity =
    profile.quantity === undefined
      ? DEFAULT_LINE_QUANTITY
      : parsePositiveDecimal(profile.quantity, 'quantity');
  return {
    type: profile.type,
    description: profile.description,
    notes: profile.notes ?? null,
    quantity,
    unitPrice: profile.unitPrice,
    acquisitionCostDop: null,
    costProvenance: 'UNKNOWN',
  };
}

function resolveDeliveryDraftLine(candidate: unknown): DraftLineWrite {
  const profile = deliveryDraftLineSchema.parse(candidate);
  return {
    type: profile.type,
    description: profile.description,
    notes: profile.notes ?? null,
    quantity: DEFAULT_LINE_QUANTITY,
    unitPrice: profile.unitPrice,
  };
}

async function resolveServiceDraftLine(
  catalogs: CatalogRepository,
  candidate: unknown,
): Promise<DraftLineWrite> {
  const profile = serviceDraftLineSchema.parse(candidate);
  const catalogService = await catalogs.findById(profile.serviceId);
  if (!catalogService) throw AppError.notFound(CATALOG_SERVICE_NOT_FOUND_MESSAGE);
  if (!catalogService.active) {
    throw AppError.conflict(INACTIVE_SERVICE_LINE_MESSAGE, { serviceId: profile.serviceId });
  }

  return {
    type: profile.type,
    description: profile.description ?? catalogService.name,
    notes: profile.notes ?? null,
    quantity: DEFAULT_LINE_QUANTITY,
    unitPrice: profile.unitPrice,
    serviceId: profile.serviceId,
  };
}

async function resolveDraftLineWrite(
  catalogs: CatalogRepository,
  candidate: { type: InvoiceLineType },
): Promise<DraftLineWrite> {
  if (candidate.type === 'SERVICE') return resolveServiceDraftLine(catalogs, candidate);
  if (candidate.type === 'DELIVERY') return resolveDeliveryDraftLine(candidate);
  if (candidate.type === 'EXTERNAL') {
    return toMerchandiseDraftLine(externalDraftLineSchema.parse(candidate));
  }
  return toMerchandiseDraftLine(genericDraftLineSchema.parse(candidate));
}

export class SalesService {
  constructor(
    private readonly transaction: SalesTransaction = salesTransaction,
    private readonly fxRateProvider: FxRateProvider = unavailableFxRateProvider,
    _sales: SalesRepository = new SalesRepository(),
    private readonly invoiceDocuments: InvoiceDocumentService = new InvoiceDocumentService(),
  ) {}

  async createDraft(actorId: string, input: unknown) {
    const profile = createDraftSchema.parse(input ?? {});
    return this.transaction(async ({ sales, customers, users, history }) => {
      const actor = requireInvoiceManager(await users.findById(actorId));
      const customer = profile.customerId
        ? await customers.findById(profile.customerId)
        : await customers.findDefault();
      if (profile.customerId && !customer) throw AppError.notFound('Customer not found');
      if (!customer) throw AppError.internal(MISSING_GENERIC_CUSTOMER_MESSAGE);

      const currency = profile.currency ?? DEFAULT_DRAFT_CURRENCY;
      const fiscal = profile.fiscal ?? false;
      const applyItbis = profile.applyItbis ?? false;
      const discountPercent = profile.discountPercent ?? '0';
      assertFiscalCustomer(customer, fiscal);

      const invoice = await sales.createDraft({
        customerId: customer.id,
        currency,
        fiscal,
        applyItbis,
        discountPercent,
      });
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'INVOICE',
        subjectId: invoice.id,
        eventType: 'INVOICE_DRAFT_CREATED',
        payload: toDraftHistorySnapshot(invoice),
      });
      return toPublicInvoice(invoice, actor);
    });
  }

  async createQuote(actorId: string, input: unknown) {
    const profile = createDraftSchema.parse(input ?? {});
    return this.transaction(async ({ sales, customers, users, history }) => {
      const actor = requireInvoiceManager(await users.findById(actorId));
      const customer = profile.customerId
        ? await customers.findById(profile.customerId)
        : await customers.findDefault();
      if (profile.customerId && !customer) throw AppError.notFound('Customer not found');
      if (!customer) throw AppError.internal(MISSING_GENERIC_CUSTOMER_MESSAGE);
      const fiscal = profile.fiscal ?? false;
      assertFiscalCustomer(customer, fiscal);
      const quote = await sales.createDraft({
        status: 'QUOTE_DRAFT',
        customerId: customer.id,
        currency: profile.currency ?? DEFAULT_DRAFT_CURRENCY,
        fiscal,
        applyItbis: profile.applyItbis ?? false,
        discountPercent: profile.discountPercent ?? '0',
      });
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'INVOICE',
        subjectId: quote.id,
        eventType: 'QUOTE_DRAFT_CREATED',
        payload: {
          status: 'QUOTE_DRAFT',
          quoteNumber: null,
          currency: quote.currency,
          fiscal: quote.fiscal,
          applyItbis: quote.applyItbis,
          customerId: quote.customerId,
        },
      });
      return toPublicInvoice(quote, actor);
    });
  }

  async list(actorId: string, query: unknown) {
    const filters = listInvoicesSchema.parse(query);
    return this.transaction(async ({ sales, users }) => {
      const actor = requireInvoiceManager(await users.findById(actorId));
      const result = await sales.list(filters);
      return { ...result, items: result.items.map((item) => toPublicInvoiceListItem(item, actor)) };
    });
  }

  async listReceivables(actorId: string, query: unknown) {
    const filters = listReceivablesSchema.parse(query);
    return this.transaction(async ({ sales, users }) => {
      const actor = requireInvoiceManager(await users.findById(actorId));
      assertAdministrator(actor);
      const now = new Date();
      const receivables = await sales.listReceivables({
        customerId: filters.customerId,
        invoice: filters.invoice,
        page: filters.page,
        pageSize: filters.pageSize,
      });
      return toPublicReceivables(
        receivables.items,
        receivables.customers,
        actor,
        now,
        filters.page,
        filters.pageSize,
        receivables.total,
      );
    });
  }

  async getById(actorId: string, id: string) {
    invoiceIdSchema.parse({ id });
    return this.transaction(async ({ sales, users, history }) => {
      const actor = requireInvoiceManager(await users.findById(actorId));
      const invoice = await sales.findById(id);
      if (!invoice) throw AppError.notFound('Invoice not found');
      const events = await history.listBySubject('INVOICE', id);
      return toPublicInvoice(invoice, actor, toInvoiceHistoryEntries(events, actor.role));
    });
  }

  async updateMeta(actorId: string, id: string, input: unknown) {
    invoiceIdSchema.parse({ id });
    const patch = updateDraftMetaSchema.parse(input);
    return this.transaction(async ({ sales, customers, users }) => {
      const actor = requireInvoiceManager(await users.findById(actorId));
      const existing = await sales.findById(id);
      if (!existing) throw AppError.notFound('Invoice not found');
      assertEditableStatus(existing.status, DRAFT_ONLY_EDIT_MESSAGE);

      let customer = existing.customer;
      if (patch.customerId) {
        const assigned = await customers.findById(patch.customerId);
        if (!assigned) throw AppError.notFound('Customer not found');
        customer = assigned;
      }

      const nextFiscal = patch.fiscal ?? existing.fiscal;
      assertFiscalCustomer(customer, nextFiscal);

      const updated = await sales.updateDraft(id, {
        customerId: patch.customerId,
        currency: patch.currency,
        fiscal: patch.fiscal,
        applyItbis: patch.applyItbis,
        discountPercent: patch.discountPercent,
      });
      return toPublicInvoice(updated, actor);
    });
  }

  async discard(actorId: string, id: string) {
    invoiceIdSchema.parse({ id });
    return this.transaction(async ({ sales, users, history }) => {
      requireInvoiceManager(await users.findById(actorId));
      const existing = await sales.findById(id);
      if (!existing) throw AppError.notFound('Invoice not found');
      assertEditableStatus(existing.status, DRAFT_ONLY_DISCARD_MESSAGE);
      if (existing.status === 'DRAFT') {
        await history.append({
          actor: { actorType: 'USER', actorUserId: actorId },
          subjectType: 'INVOICE',
          subjectId: id,
          eventType: 'INVOICE_DRAFT_DISCARDED',
          payload: toDraftHistorySnapshot(existing),
        });
      }
      await sales.deleteById(id);
    });
  }

  async addLine(actorId: string, invoiceId: string, input: unknown) {
    invoiceIdSchema.parse({ id: invoiceId });
    const candidate = addInvoiceLineSchema.parse(input);

    return this.transaction(async ({ sales, users, catalogs }) => {
      const actor = requireInvoiceManager(await users.findById(actorId));
      const existing = await sales.findById(invoiceId);
      if (!existing) throw AppError.notFound('Invoice not found');
      assertEditableStatus(existing.status, DRAFT_ONLY_EDIT_MESSAGE);
      assertDraftLineTypeEnabled(candidate.type);
      if (
        candidate.type === 'DELIVERY' &&
        existing.lines.some((line) => line.type === 'DELIVERY')
      ) {
        throw AppError.conflict(DUPLICATE_DELIVERY_LINE_MESSAGE);
      }
      const line = await resolveDraftLineWrite(catalogs, candidate);

      calculateLineMoney({
        type: line.type,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        applyItbis: existing.applyItbis,
      });

      const updated = await sales.addLine({
        invoiceId,
        ...line,
      });
      return toPublicInvoice(updated, actor);
    });
  }

  async setLinePrice(actorId: string, invoiceId: string, lineId: string, input: unknown) {
    invoiceLineIdSchema.parse({ id: invoiceId, lineId });
    const patch = setLinePriceSchema.parse(input);

    return this.transaction(async ({ sales, users }) => {
      const actor = requireInvoiceManager(await users.findById(actorId));
      const existing = await sales.findById(invoiceId);
      if (!existing) throw AppError.notFound('Invoice not found');
      assertEditableStatus(existing.status, DRAFT_ONLY_EDIT_MESSAGE);
      const line = existing.lines.find((entry) => entry.id === lineId);
      if (!line) throw AppError.notFound(LINE_NOT_FOUND_MESSAGE);
      assertDraftLineTypeEnabled(line.type);
      if (patch.quantity !== undefined) {
        assertDraftLineQuantityEditable(line.type);
      }
      if (patch.description !== undefined) {
        assertDraftLineDescriptionEditable(line.type);
      }

      const unitPrice = patch.unitPrice ?? line.unitPrice;
      const quantity = patch.quantity ?? line.quantity;
      calculateLineMoney({
        type: line.type,
        unitPrice,
        quantity,
        applyItbis: existing.applyItbis,
      });

      const updated = await sales.updateLine({
        invoiceId,
        lineId,
        ...(patch.unitPrice !== undefined ? { unitPrice: patch.unitPrice } : {}),
        ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      });
      const next = updated.lines.find((entry) => entry.id === lineId);
      if (!next) throw AppError.internal(LINE_NOT_FOUND_MESSAGE);
      return toPublicInvoice(updated, actor);
    });
  }

  async removeLine(actorId: string, invoiceId: string, lineId: string) {
    invoiceLineIdSchema.parse({ id: invoiceId, lineId });

    return this.transaction(async ({ sales, users }) => {
      const actor = requireInvoiceManager(await users.findById(actorId));
      const existing = await sales.findById(invoiceId);
      if (!existing) throw AppError.notFound('Invoice not found');
      assertEditableStatus(existing.status, DRAFT_ONLY_EDIT_MESSAGE);
      const line = existing.lines.find((entry) => entry.id === lineId);
      if (!line) throw AppError.notFound(LINE_NOT_FOUND_MESSAGE);

      const updated = await sales.removeLine(invoiceId, lineId);
      return toPublicInvoice(updated, actor);
    });
  }

  async issueQuote(actorId: string, id: string) {
    invoiceIdSchema.parse({ id });
    return this.transaction(async ({ sales, customers, users, history }) => {
      const actor = requireInvoiceManager(await users.findById(actorId));
      await sales.lockById(id);
      const existing = await sales.findById(id);
      if (!existing) throw AppError.notFound('Invoice not found');
      if (existing.status === 'QUOTE_ISSUED') return toPublicInvoice(existing, actor);
      if (existing.status !== 'QUOTE_DRAFT') {
        throw AppError.conflict(QUOTE_DRAFT_ONLY_ISSUE_MESSAGE);
      }
      if (existing.lines.length === 0) throw AppError.conflict(EMPTY_DRAFT_CONFIRM_MESSAGE);
      for (const line of existing.lines) assertDraftLineTypeEnabled(line.type);

      await customers.lockById(existing.customerId);
      const customer = await customers.findById(existing.customerId);
      if (!customer) throw AppError.notFound('Customer not found');
      assertFiscalCustomer(customer, existing.fiscal);
      const lineMoney = existing.lines.map((line) => ({
        line,
        money: calculateLineMoney({
          type: line.type,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          applyItbis: existing.applyItbis,
        }),
      }));
      const totals = applyInvoiceDiscount({
        lines: lineMoney.map(({ line, money }) => ({
          ...money,
          taxable: isTaxableLineType(line.type),
        })),
        discountPercent: existing.discountPercent,
        applyItbis: existing.applyItbis,
      });
      const issuedAt = new Date();
      const issued = await sales.issueQuote({
        id,
        quoteNumber: await sales.allocateNextQuoteNumber(),
        quoteIssuedAt: issuedAt,
        quoteExpiresAt: quoteExpirationDate(issuedAt),
        customerName: customer.name,
        customerRnc: customer.rnc,
        customerPhone: customer.contacts.find((contact) => contact.isPrimary)?.phone ?? null,
        // Freeze issuer like confirmedBy on invoices so COT- PDFs stay deterministic.
        quoteIssuedByUserId: actorId,
        quoteIssuedByName: actor.name,
        gross: totals.gross,
        base: totals.base,
        itbis: totals.itbis,
        lines: lineMoney.map(({ line, money }) => ({ id: line.id, ...money })),
      });
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'INVOICE',
        subjectId: id,
        eventType: 'QUOTE_ISSUED',
        payload: {
          quoteNumber: issued.quoteNumber!,
          issuedAt: issued.quoteIssuedAt!.toISOString(),
          expiresAt: issued.quoteExpiresAt!.toISOString(),
          customerSnapshot: {
            name: issued.customerName!,
            rnc: issued.customerRnc,
            phone: issued.customerPhone,
          },
          totals: {
            gross: totals.gross.toFixed(2),
            base: totals.base.toFixed(2),
            itbis: totals.itbis.toFixed(2),
            discount: totals.discount.toFixed(2),
          },
        },
      });
      return toPublicInvoice(issued, actor);
    });
  }

  async duplicateQuote(actorId: string, id: string) {
    invoiceIdSchema.parse({ id });
    return this.transaction(async ({ sales, users, history }) => {
      const actor = requireInvoiceManager(await users.findById(actorId));
      await sales.lockById(id);
      const source = await sales.findById(id);
      if (!source) throw AppError.notFound('Invoice not found');
      if (source.status !== 'QUOTE_ISSUED' || source.quoteNumber == null) {
        throw AppError.conflict(QUOTE_ISSUED_ONLY_DUPLICATE_MESSAGE);
      }
      const duplicate = await sales.duplicateAsQuoteDraft(source);
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'INVOICE',
        subjectId: source.id,
        eventType: 'QUOTE_DUPLICATED',
        payload: {
          sourceQuoteId: source.id,
          sourceQuoteNumber: source.quoteNumber,
          duplicatedQuoteId: duplicate.id,
        },
      });
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'INVOICE',
        subjectId: duplicate.id,
        eventType: 'QUOTE_DRAFT_CREATED',
        payload: {
          status: 'QUOTE_DRAFT',
          quoteNumber: null,
          currency: duplicate.currency,
          fiscal: duplicate.fiscal,
          applyItbis: duplicate.applyItbis,
          customerId: duplicate.customerId,
        },
      });
      return toPublicInvoice(duplicate, actor);
    });
  }

  async confirm(actorId: string, id: string, input: unknown) {
    return this.completeSale(actorId, id, input, 'DRAFT');
  }

  async convertQuote(actorId: string, id: string, input: unknown) {
    return this.completeSale(actorId, id, input, 'QUOTE_ISSUED');
  }

  async issueConduce(actorId: string, id: string, input: unknown) {
    return this.issueConduceSale(actorId, id, input, 'DRAFT');
  }

  async convertQuoteToConduce(actorId: string, id: string, input: unknown) {
    return this.issueConduceSale(actorId, id, input, 'QUOTE_ISSUED');
  }

  async convertConduceToInvoice(actorId: string, id: string, input: unknown) {
    invoiceIdSchema.parse({ id });
    const profile = convertConduceToInvoiceSchema.parse(input ?? {});
    const { invoice, actor, alreadyCompleted } = await this.transaction(
      async ({ sales, users, history }) => {
        const actor = requireInvoiceManager(await users.findById(actorId));
        await sales.lockById(id);
        const existing = await sales.findById(id);
        if (!existing) throw AppError.notFound('Invoice not found');

        if (existing.status === 'COMPLETED' && existing.conduceNumber != null) {
          if (existing.fiscal !== profile.fiscal) {
            throw AppError.conflict(CONDUCE_FISCAL_RETRY_MISMATCH_MESSAGE);
          }
          return { invoice: existing, actor, alreadyCompleted: true };
        }
        if (existing.status !== 'CONDUCE') {
          throw AppError.conflict(CONDUCE_ONLY_CONVERT_TO_INVOICE_MESSAGE);
        }

        // Fiscal identity is validated against the frozen conduce snapshot (CON-003).
        assertFiscalCustomer(
          { isDefault: existing.customer.isDefault, rnc: existing.customerRnc },
          profile.fiscal,
        );

        const number = await sales.allocateNextNumber();
        const invoiceIssuedAt = new Date();
        const converted = await sales.convertConduceToInvoice({
          id,
          number,
          invoiceIssuedAt,
          fiscal: profile.fiscal,
        });
        await history.append({
          actor: { actorType: 'USER', actorUserId: actorId },
          subjectType: 'INVOICE',
          subjectId: id,
          eventType: 'CONDUCE_INVOICED',
          payload: {
            conduceNumber: existing.conduceNumber!,
            invoiceNumber: converted.number!,
            fiscal: profile.fiscal,
            invoicedAt: invoiceIssuedAt.toISOString(),
          },
        });
        return { invoice: converted, actor, alreadyCompleted: false };
      },
    );
    const withDocument = alreadyCompleted
      ? invoice
      : await this.generateInvoicePdf(actorId, invoice);
    return toPublicInvoice(withDocument, actor);
  }

  /**
   * Recognizes a sale as CONDUCE (no FAC-). Payment/dueDate follow CON-002
   * (Admin named-CASH balance exception; default Cliente contado always full).
   */
  private async issueConduceSale(
    actorId: string,
    id: string,
    input: unknown,
    sourceStatus: 'DRAFT' | 'QUOTE_ISSUED',
  ) {
    invoiceIdSchema.parse({ id });
    const profile = issueConduceSchema.parse(input ?? {});
    const { invoice, actor } = await this.transaction(
      async ({ sales, customers, payments, users, history }) => {
        const actor = requireInvoiceManager(await users.findById(actorId));
        await sales.lockById(id);
        const existing = await sales.findById(id);
        if (!existing) throw AppError.notFound('Invoice not found');
        if (existing.status === 'CONDUCE') {
          return { invoice: existing, actor };
        }
        if (existing.status !== sourceStatus) {
          throw AppError.conflict(
            sourceStatus === 'DRAFT'
              ? DRAFT_ONLY_ISSUE_CONDUCE_MESSAGE
              : QUOTE_ISSUED_ONLY_CONVERT_TO_CONDUCE_MESSAGE,
          );
        }
        if (sourceStatus === 'QUOTE_ISSUED' && isQuoteExpired(existing.quoteExpiresAt)) {
          throw AppError.conflict(EXPIRED_QUOTE_CONVERT_MESSAGE);
        }
        if (existing.lines.length === 0) throw AppError.conflict(EMPTY_DRAFT_CONFIRM_MESSAGE);

        for (const line of existing.lines) {
          assertDraftLineTypeEnabled(line.type);
        }

        await customers.lockById(existing.customerId);
        const customer = await customers.findById(existing.customerId);
        if (!customer) throw AppError.notFound('Customer not found');

        const lineMoney = existing.lines.map((line) => ({
          line,
          money:
            sourceStatus === 'QUOTE_ISSUED'
              ? (() => {
                  if (line.gross == null || line.base == null || line.itbis == null) {
                    throw AppError.internal('Issued quote line is missing frozen money');
                  }
                  return { gross: line.gross, base: line.base, itbis: line.itbis };
                })()
              : calculateLineMoney({
                  type: line.type,
                  unitPrice: line.unitPrice,
                  quantity: line.quantity,
                  applyItbis: existing.applyItbis,
                }),
        }));
        const totals = applyInvoiceDiscount({
          lines: lineMoney.map(({ line, money }) => ({
            ...money,
            taxable: isTaxableLineType(line.type),
          })),
          discountPercent: existing.discountPercent,
          applyItbis: existing.applyItbis,
        });
        const initialPaymentAmount = profile.payment
          ? new Prisma.Decimal(profile.payment.amount)
          : null;
        if (initialPaymentAmount?.greaterThan(totals.gross)) {
          throw AppError.conflict(PAYMENT_EXCEEDS_BALANCE_MESSAGE);
        }
        assertConduceInitialPaymentPolicy({
          customer,
          currency: existing.currency,
          actorRole: actor.role,
          invoiceGross: totals.gross,
          initialPaymentAmount,
        });
        const newBalance = invoiceNewBalance(totals.gross, initialPaymentAmount);
        const openInvoices = await customers.findCompletedInvoicesWithPayments(customer.id);
        const openExposure = openInvoices.reduce(
          (sum, invoice) => sum.plus(summarizePayments(invoice).balance),
          new Prisma.Decimal(0),
        );
        assertCreditExposureWithinLimit({
          customer,
          currency: existing.currency,
          openExposure,
          newBalance,
        });
        const conduceNumber = await sales.allocateNextConduceNumber();
        const confirmedAt = new Date();
        const dueDate = resolveConduceDueDate({
          customer,
          currency: existing.currency,
          actorRole: actor.role,
          confirmedAt,
          newBalance,
          actorDueDate: profile.dueDate,
        });
        const primaryPhone = customer.contacts.find((contact) => contact.isPrimary)?.phone ?? null;
        let issued = await sales.issueConduce({
          id,
          conduceNumber,
          confirmedAt,
          dueDate,
          customerName: sourceStatus === 'QUOTE_ISSUED' ? existing.customerName! : customer.name,
          customerRnc: sourceStatus === 'QUOTE_ISSUED' ? existing.customerRnc : customer.rnc,
          customerPhone: sourceStatus === 'QUOTE_ISSUED' ? existing.customerPhone : primaryPhone,
          snapshotCustomerType: customer.customerType,
          snapshotCreditTermDays: customer.creditTermDays,
          confirmedByUserId: actorId,
          confirmedByName: actor.name,
          gross: totals.gross,
          base: totals.base,
          itbis: totals.itbis,
          lines: lineMoney.map(({ line, money }) => ({
            id: line.id,
            gross: money.gross,
            base: money.base,
            itbis: money.itbis,
          })),
        });
        if (sourceStatus === 'QUOTE_ISSUED') {
          await history.append({
            actor: { actorType: 'USER', actorUserId: actorId },
            subjectType: 'INVOICE',
            subjectId: id,
            eventType: 'QUOTE_CONVERTED_TO_CONDUCE',
            payload: {
              quoteNumber: existing.quoteNumber!,
              conduceNumber: issued.conduceNumber!,
              issuedAt: existing.quoteIssuedAt!.toISOString(),
              convertedAt: issued.confirmedAt!.toISOString(),
            },
          });
        } else {
          await history.append({
            actor: { actorType: 'USER', actorUserId: actorId },
            subjectType: 'INVOICE',
            subjectId: id,
            eventType: 'CONDUCE_ISSUED',
            payload: toConduceIssuedHistorySnapshot(issued),
          });
        }
        if (profile.payment && initialPaymentAmount) {
          const payment = await payments.createPayment({
            invoiceId: id,
            amount: initialPaymentAmount,
            currency: issued.currency,
            method: profile.payment.method,
            effectiveDate: todayBusinessDate(confirmedAt),
            reference: profile.payment.reference ?? null,
            actorUserId: actorId,
            idempotencyKey: confirmationPaymentIdempotencyKey(id),
          });
          await history.append({
            actor: { actorType: 'USER', actorUserId: actorId },
            subjectType: 'INVOICE',
            subjectId: id,
            eventType: 'PAYMENT_RECORDED',
            payload: {
              paymentId: payment.id,
              amount: payment.amount.toFixed(2),
              currency: payment.currency,
              method: payment.method,
              effectiveDate: databaseDateString(payment.effectiveDate),
              reference: payment.reference,
            },
          });
          issued = (await sales.findById(id))!;
        }
        return { invoice: issued, actor };
      },
    );
    // FX/profitability (M6) and conduce PDF (M5) are intentionally deferred.
    return toPublicInvoice(invoice, actor);
  }

  private async completeSale(
    actorId: string,
    id: string,
    input: unknown,
    sourceStatus: 'DRAFT' | 'QUOTE_ISSUED',
  ) {
    invoiceIdSchema.parse({ id });
    const profile = confirmInvoiceSchema.parse(input ?? {});
    const { invoice, actor, alreadyCompleted } = await this.transaction(
      async ({ sales, customers, payments, users, history }) => {
        const actor = requireInvoiceManager(await users.findById(actorId));
        await sales.lockById(id);
        const existing = await sales.findById(id);
        if (!existing) throw AppError.notFound('Invoice not found');
        if (
          existing.status === 'COMPLETED' &&
          (sourceStatus === 'DRAFT' || existing.quoteNumber != null)
        ) {
          return { invoice: existing, actor, alreadyCompleted: true };
        }
        if (existing.status !== sourceStatus) {
          throw AppError.conflict(
            sourceStatus === 'DRAFT'
              ? DRAFT_ONLY_CONFIRM_MESSAGE
              : QUOTE_ISSUED_ONLY_CONVERT_MESSAGE,
          );
        }
        if (sourceStatus === 'QUOTE_ISSUED' && isQuoteExpired(existing.quoteExpiresAt)) {
          throw AppError.conflict(EXPIRED_QUOTE_CONVERT_MESSAGE);
        }
        if (existing.lines.length === 0) throw AppError.conflict(EMPTY_DRAFT_CONFIRM_MESSAGE);

        for (const line of existing.lines) {
          assertDraftLineTypeEnabled(line.type);
        }

        await customers.lockById(existing.customerId);
        const customer = await customers.findById(existing.customerId);
        if (!customer) throw AppError.notFound('Customer not found');
        // The issued quote owns the immutable commercial identity; conversion only
        // revalidates the customer's current credit classification, limit and term.
        if (sourceStatus === 'DRAFT') assertFiscalCustomer(customer, existing.fiscal);

        const lineMoney = existing.lines.map((line) => ({
          line,
          money:
            sourceStatus === 'QUOTE_ISSUED'
              ? (() => {
                  if (line.gross == null || line.base == null || line.itbis == null) {
                    throw AppError.internal('Issued quote line is missing frozen money');
                  }
                  return { gross: line.gross, base: line.base, itbis: line.itbis };
                })()
              : calculateLineMoney({
                  type: line.type,
                  unitPrice: line.unitPrice,
                  quantity: line.quantity,
                  applyItbis: existing.applyItbis,
                }),
        }));
        const totals = applyInvoiceDiscount({
          lines: lineMoney.map(({ line, money }) => ({
            ...money,
            taxable: isTaxableLineType(line.type),
          })),
          discountPercent: existing.discountPercent,
          applyItbis: existing.applyItbis,
        });
        const initialPaymentAmount = profile.payment
          ? new Prisma.Decimal(profile.payment.amount)
          : null;
        if (initialPaymentAmount?.greaterThan(totals.gross)) {
          throw AppError.conflict(PAYMENT_EXCEEDS_BALANCE_MESSAGE);
        }
        assertInitialPaymentPolicy({
          customer,
          currency: existing.currency,
          actorRole: actor.role,
          invoiceGross: totals.gross,
          initialPaymentAmount,
        });
        const newBalance = invoiceNewBalance(totals.gross, initialPaymentAmount);
        const openInvoices = await customers.findCompletedInvoicesWithPayments(customer.id);
        const openExposure = openInvoices.reduce(
          (sum, invoice) => sum.plus(summarizePayments(invoice).balance),
          new Prisma.Decimal(0),
        );
        assertCreditExposureWithinLimit({
          customer,
          currency: existing.currency,
          openExposure,
          newBalance,
        });
        const number = await sales.allocateNextNumber();
        const confirmedAt = new Date();
        const primaryPhone = customer.contacts.find((contact) => contact.isPrimary)?.phone ?? null;
        let completed = await sales.completeInvoice({
          id,
          number,
          confirmedAt,
          dueDate: invoiceDueDate(
            confirmedAt,
            confirmationDueTermDays(customer, existing.currency),
          ),
          customerName: sourceStatus === 'QUOTE_ISSUED' ? existing.customerName! : customer.name,
          customerRnc: sourceStatus === 'QUOTE_ISSUED' ? existing.customerRnc : customer.rnc,
          customerPhone: sourceStatus === 'QUOTE_ISSUED' ? existing.customerPhone : primaryPhone,
          snapshotCustomerType: customer.customerType,
          snapshotCreditTermDays: customer.creditTermDays,
          confirmedByUserId: actorId,
          confirmedByName: actor.name,
          gross: totals.gross,
          base: totals.base,
          itbis: totals.itbis,
          lines: lineMoney.map(({ line, money }) => ({
            id: line.id,
            gross: money.gross,
            base: money.base,
            itbis: money.itbis,
          })),
        });
        if (sourceStatus === 'QUOTE_ISSUED') {
          await history.append({
            actor: { actorType: 'USER', actorUserId: actorId },
            subjectType: 'INVOICE',
            subjectId: id,
            eventType: 'QUOTE_CONVERTED',
            payload: {
              quoteNumber: existing.quoteNumber!,
              invoiceNumber: completed.number!,
              issuedAt: existing.quoteIssuedAt!.toISOString(),
              convertedAt: completed.confirmedAt!.toISOString(),
            },
          });
        } else {
          await history.append({
            actor: { actorType: 'USER', actorUserId: actorId },
            subjectType: 'INVOICE',
            subjectId: id,
            eventType: 'INVOICE_CONFIRMED',
            payload: toConfirmedHistorySnapshot(completed),
          });
        }
        if (profile.payment && initialPaymentAmount) {
          const payment = await payments.createPayment({
            invoiceId: id,
            amount: initialPaymentAmount,
            currency: completed.currency,
            method: profile.payment.method,
            effectiveDate: todayBusinessDate(confirmedAt),
            reference: profile.payment.reference ?? null,
            actorUserId: actorId,
            // Always confirm:{id} so saleCondition reconstruction ignores nearby CxC payments.
            idempotencyKey: confirmationPaymentIdempotencyKey(id),
          });
          await history.append({
            actor: { actorType: 'USER', actorUserId: actorId },
            subjectType: 'INVOICE',
            subjectId: id,
            eventType: 'PAYMENT_RECORDED',
            payload: {
              paymentId: payment.id,
              amount: payment.amount.toFixed(2),
              currency: payment.currency,
              method: payment.method,
              effectiveDate: databaseDateString(payment.effectiveDate),
              reference: payment.reference,
            },
          });
          completed = (await sales.findById(id))!;
        }
        return { invoice: completed, actor, alreadyCompleted: false };
      },
    );
    const enriched = alreadyCompleted
      ? invoice
      : await this.enrichUsdProfitability(actorId, invoice);
    const withDocument = alreadyCompleted
      ? enriched
      : await this.generateInvoicePdf(actorId, enriched);
    return toPublicInvoice(withDocument, actor);
  }

  async addPayment(actorId: string, id: string, input: unknown) {
    invoiceIdSchema.parse({ id });
    const profile = addPaymentSchema.parse(input);
    return this.transaction(async ({ sales, payments, users, history }) => {
      const actor = requireInvoiceManager(await users.findById(actorId));
      assertAdministrator(actor);
      await sales.lockById(id);
      let invoice = await sales.findById(id);
      if (!invoice) throw AppError.notFound('Invoice not found');
      if (invoice.status !== 'COMPLETED' && invoice.status !== 'CONDUCE') {
        throw AppError.conflict(PAYMENT_COMPLETED_ONLY_MESSAGE);
      }
      if (invoice.confirmedAt == null) {
        throw AppError.conflict(PAYMENT_COMPLETED_ONLY_MESSAGE);
      }

      const duplicate = await payments.findByIdempotencyKey(id, profile.idempotencyKey);
      if (duplicate) {
        const samePayment =
          duplicate.kind === 'PAYMENT' &&
          duplicate.amount.equals(profile.amount) &&
          duplicate.method === profile.method &&
          databaseDateString(duplicate.effectiveDate) === profile.effectiveDate &&
          duplicate.reference === (profile.reference ?? null) &&
          duplicate.currency === invoice.currency;
        if (!samePayment) throw AppError.conflict(PAYMENT_IDEMPOTENCY_MISMATCH_MESSAGE);
        return toPublicInvoice(invoice, actor);
      }

      const confirmedDate = businessDateString(invoice.confirmedAt);
      const today = databaseDateString(todayBusinessDate());
      if (profile.effectiveDate < confirmedDate || profile.effectiveDate > today) {
        throw AppError.conflict(PAYMENT_DATE_RANGE_MESSAGE);
      }
      const amount = new Prisma.Decimal(profile.amount);
      const summary = summarizePayments(invoice);
      if (amount.greaterThan(summary.balance)) {
        throw AppError.conflict(PAYMENT_EXCEEDS_BALANCE_MESSAGE);
      }

      const payment = await payments.createPayment({
        invoiceId: id,
        amount,
        currency: invoice.currency,
        method: profile.method,
        effectiveDate: databaseDate(profile.effectiveDate),
        reference: profile.reference ?? null,
        actorUserId: actorId,
        idempotencyKey: profile.idempotencyKey,
      });
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'INVOICE',
        subjectId: id,
        eventType: 'PAYMENT_RECORDED',
        payload: {
          paymentId: payment.id,
          amount: payment.amount.toFixed(2),
          currency: payment.currency,
          method: payment.method,
          effectiveDate: databaseDateString(payment.effectiveDate),
          reference: payment.reference,
        },
      });
      invoice = (await sales.findById(id))!;
      return toPublicInvoice(invoice, actor);
    });
  }

  async cancel(actorId: string, id: string, input: unknown) {
    invoiceIdSchema.parse({ id });
    const profile = cancelInvoiceSchema.parse(input);
    return this.transaction(async ({ sales, payments, users, history }) => {
      const actor = await users.findById(actorId);
      assertAdministrator(actor);
      if (!actor) throw AppError.unauthorized();
      await sales.lockById(id);
      const invoice = await sales.findById(id);
      if (!invoice) throw AppError.notFound('Invoice not found');
      if (
        invoice.status === 'CANCELLED' &&
        invoice.cancellationIdempotencyKey === profile.idempotencyKey
      ) {
        return toPublicInvoice(invoice, actor);
      }
      if (invoice.status !== 'COMPLETED' && invoice.status !== 'CONDUCE') {
        throw AppError.conflict(CANCELLATION_COMPLETED_ONLY_MESSAGE);
      }
      if (!profile.reason) throw AppError.conflict(CANCELLATION_REASON_REQUIRED_MESSAGE);

      const summary = summarizePayments(invoice);
      const netReceived = summary.paid.minus(summary.refunded);
      const refundAmount =
        profile.refundAmount != null
          ? new Prisma.Decimal(profile.refundAmount)
          : netReceived.isZero()
            ? new Prisma.Decimal(0)
            : null;
      if (refundAmount == null) {
        throw AppError.conflict(CANCELLATION_REFUND_AMOUNT_REQUIRED_MESSAGE);
      }
      if (refundAmount.greaterThan(netReceived)) {
        throw AppError.conflict(CANCELLATION_REFUND_EXCEEDS_NET_MESSAGE);
      }
      if (refundAmount.greaterThan(0) && !profile.refundMethod) {
        throw AppError.conflict(CANCELLATION_REFUND_METHOD_REQUIRED_MESSAGE);
      }

      const cancelledAt = new Date();
      const refund = refundAmount.greaterThan(0)
        ? await payments.createRefund({
            invoiceId: id,
            amount: refundAmount,
            currency: invoice.currency,
            method: profile.refundMethod!,
            effectiveDate: todayBusinessDate(cancelledAt),
            reference: profile.refundReference ?? null,
            actorUserId: actorId,
            idempotencyKey: profile.idempotencyKey,
          })
        : null;
      const cancelled = await sales.cancelInvoice({
        id,
        cancelledAt,
        reason: profile.reason,
        actorUserId: actorId,
        actorName: actor.name,
        idempotencyKey: profile.idempotencyKey,
      });
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'INVOICE',
        subjectId: id,
        eventType: 'INVOICE_CANCELLED',
        payload: {
          reason: profile.reason,
          cancelledAt: cancelledAt.toISOString(),
          cancelledByName: actor.name,
          refundId: refund?.id ?? null,
          refundAmount: refundAmount.toFixed(2),
          refundMethod: refund?.method ?? null,
        },
      });
      return toPublicInvoice(cancelled, actor);
    });
  }

  async getPdf(actorId: string, id: string) {
    return this.invoiceDocuments.download(actorId, id);
  }

  async regeneratePdf(actorId: string, id: string) {
    const { invoice, actor } = await this.invoiceDocuments.regenerate(actorId, id);
    return toPublicInvoice(invoice, actor);
  }

  /**
   * PDF is outside the commercial transaction. Failure leaves the sale committed
   * and document FAILED. Idempotent confirm does not retry.
   */
  private async generateInvoicePdf(
    actorId: string,
    invoice: InvoiceRecord,
  ): Promise<InvoiceRecord> {
    try {
      return await this.invoiceDocuments.recordInitialGeneration(actorId, invoice);
    } catch (error) {
      logger.warn(
        { invoiceId: invoice.id, reason: error instanceof Error ? error.name : 'unknown' },
        'invoice PDF persistence failed',
      );
      return invoice;
    }
  }

  /**
   * FX is outside the commercial transaction. Failure leaves the sale committed
   * and profitability PENDING_FX_RATE.
   */
  private async enrichUsdProfitability(
    actorId: string,
    invoice: InvoiceRecord,
  ): Promise<InvoiceRecord> {
    if (
      invoice.currency !== 'USD' ||
      invoice.confirmedAt == null ||
      invoice.exchangeRateDopPerUsd != null
    ) {
      return invoice;
    }
    const confirmedAt = invoice.confirmedAt;

    try {
      const result = await this.fxRateProvider.getUsdToDopRate();
      if (!result.ok) {
        logger.warn({ invoiceId: invoice.id, reason: result.reason }, 'USD FX rate unavailable');
        return invoice;
      }
      return await this.transaction(async ({ sales, history }) => {
        await sales.lockById(invoice.id);
        const existing = await sales.findById(invoice.id);
        if (
          existing == null ||
          existing.status !== 'COMPLETED' ||
          existing.currency !== 'USD' ||
          existing.exchangeRateDopPerUsd != null
        ) {
          return existing ?? invoice;
        }

        const persisted = await sales.recordUsdFxRate({
          id: invoice.id,
          exchangeRateDopPerUsd: result.quote.exchangeRateDopPerUsd,
          source: result.quote.source,
          rateUpdatedAt: result.quote.rateUpdatedAt,
          obtainedAt: result.quote.obtainedAt,
        });
        if (!persisted.recorded) return persisted.invoice ?? existing;

        await history.append({
          actor: { actorType: 'USER', actorUserId: actorId },
          subjectType: 'INVOICE',
          subjectId: invoice.id,
          eventType: 'INVOICE_USD_FX_RECORDED',
          payload: toUsdFxRecordedHistorySnapshot({
            asOf: confirmedAt,
            after: result.quote,
          }),
        });
        return persisted.invoice ?? existing;
      });
    } catch (error) {
      logger.warn(
        { invoiceId: invoice.id, reason: error instanceof Error ? error.name : 'unknown' },
        'USD FX lookup failed',
      );
      return invoice;
    }
  }
}

export const salesService = new SalesService();
