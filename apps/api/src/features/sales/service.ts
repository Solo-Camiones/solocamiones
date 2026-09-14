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
import { openReceivables } from '../payments/receivables.js';
import { toInvoiceHistoryEntries } from '../history/invoice-timeline.js';
import { assertAdministrator } from '../users/policies.js';
import {
  CATALOG_SERVICE_NOT_FOUND_MESSAGE,
  DEFAULT_DRAFT_CURRENCY,
  DRAFT_ONLY_CONFIRM_MESSAGE,
  DRAFT_ONLY_DISCARD_MESSAGE,
  DRAFT_ONLY_EDIT_MESSAGE,
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
} from './constants.js';
import { DEFAULT_LINE_QUANTITY } from './money/constants.js';
import {
  calculateLineMoney,
  normalizeAcquisitionCost,
  parsePositiveDecimal,
  sumInvoiceMoney,
} from './money/index.js';
import {
  assertCashCustomerPaidInFull,
  assertDraftLineCostEditable,
  assertDraftLineDescriptionEditable,
  assertDraftLineQuantityEditable,
  assertDraftLineTypeEnabled,
  requireInvoiceManager,
} from './policies.js';
import {
  toConfirmedHistorySnapshot,
  toDraftHistorySnapshot,
  toPublicInvoice,
  toPublicInvoiceListItem,
  toPublicReceivables,
  toUsdFxRecordedHistorySnapshot,
} from './projection.js';
import { SalesRepository } from './repository.js';
import { salesTransaction, type SalesTransaction } from './transaction.js';
import type { CreateInvoiceLineRecord, InvoiceRecord } from './types.js';
import {
  addInvoiceLineSchema,
  addPaymentSchema,
  cancelInvoiceSchema,
  confirmInvoiceSchema,
  createDraftSchema,
  deliveryDraftLineSchema,
  externalDraftLineSchema,
  genericDraftLineSchema,
  invoiceIdSchema,
  invoiceLineIdSchema,
  listInvoicesSchema,
  listReceivablesSchema,
  serviceDraftLineSchema,
  setLinePriceSchema,
  updateDraftMetaSchema,
} from './validation.js';

type DraftLineWrite = Omit<CreateInvoiceLineRecord, 'invoiceId'>;

function assertDraftStatus(status: InvoiceStatus, message: string): void {
  if (status !== 'DRAFT') throw AppError.conflict(message);
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
  costProvenance: 'ACTUAL' | 'ESTIMATED' | 'UNKNOWN';
  acquisitionCostDop?: string | null;
}): DraftLineWrite {
  // GENERIC and EXTERNAL share COST-001: DOP cost + provenance, optional quantity.
  const quantity =
    profile.quantity === undefined
      ? DEFAULT_LINE_QUANTITY
      : parsePositiveDecimal(profile.quantity, 'quantity');
  const cost = normalizeAcquisitionCost({
    provenance: profile.costProvenance,
    amount: profile.acquisitionCostDop,
  });
  return {
    type: profile.type,
    description: profile.description,
    notes: profile.notes ?? null,
    quantity,
    unitPrice: profile.unitPrice,
    acquisitionCostDop: cost.amount,
    costProvenance: cost.provenance,
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
      assertFiscalCustomer(customer, fiscal);

      const invoice = await sales.createDraft({
        customerId: customer.id,
        currency,
        fiscal,
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
      const receivables = await sales.listReceivables({
        customerId: filters.customerId,
        currency: filters.currency,
        paymentState: filters.paymentState,
        page: filters.page,
        pageSize: filters.pageSize,
        today: todayBusinessDate(),
      });
      const open = openReceivables(receivables.items);
      return toPublicReceivables(
        open,
        receivables.customers,
        actor,
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
      assertDraftStatus(existing.status, DRAFT_ONLY_EDIT_MESSAGE);

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
      assertDraftStatus(existing.status, DRAFT_ONLY_DISCARD_MESSAGE);
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'INVOICE',
        subjectId: id,
        eventType: 'INVOICE_DRAFT_DISCARDED',
        payload: toDraftHistorySnapshot(existing),
      });
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
      assertDraftStatus(existing.status, DRAFT_ONLY_EDIT_MESSAGE);
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
        fiscal: existing.fiscal,
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
      assertDraftStatus(existing.status, DRAFT_ONLY_EDIT_MESSAGE);
      const line = existing.lines.find((entry) => entry.id === lineId);
      if (!line) throw AppError.notFound(LINE_NOT_FOUND_MESSAGE);
      assertDraftLineTypeEnabled(line.type);
      if (patch.quantity !== undefined) {
        assertDraftLineQuantityEditable(line.type);
      }
      if (patch.description !== undefined) {
        assertDraftLineDescriptionEditable(line.type);
      }
      if (patch.acquisitionCostDop !== undefined || patch.costProvenance !== undefined) {
        assertDraftLineCostEditable(line.type);
      }

      const unitPrice = patch.unitPrice ?? line.unitPrice;
      const quantity = patch.quantity ?? line.quantity;
      calculateLineMoney({
        type: line.type,
        unitPrice,
        quantity,
        fiscal: existing.fiscal,
      });

      const costPatch =
        patch.costProvenance === undefined
          ? {}
          : (() => {
              const cost = normalizeAcquisitionCost({
                provenance: patch.costProvenance,
                amount: patch.acquisitionCostDop,
              });
              return {
                acquisitionCostDop: cost.amount,
                costProvenance: cost.provenance,
              };
            })();

      const updated = await sales.updateLine({
        invoiceId,
        lineId,
        ...(patch.unitPrice !== undefined ? { unitPrice: patch.unitPrice } : {}),
        ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...costPatch,
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
      assertDraftStatus(existing.status, DRAFT_ONLY_EDIT_MESSAGE);
      const line = existing.lines.find((entry) => entry.id === lineId);
      if (!line) throw AppError.notFound(LINE_NOT_FOUND_MESSAGE);

      const updated = await sales.removeLine(invoiceId, lineId);
      return toPublicInvoice(updated, actor);
    });
  }

  async confirm(actorId: string, id: string, input: unknown) {
    invoiceIdSchema.parse({ id });
    const profile = confirmInvoiceSchema.parse(input ?? {});
    const { invoice, actor, alreadyCompleted } = await this.transaction(
      async ({ sales, customers, payments, users, history }) => {
        const actor = requireInvoiceManager(await users.findById(actorId));
        await sales.lockById(id);
        const existing = await sales.findById(id);
        if (!existing) throw AppError.notFound('Invoice not found');
        if (existing.status === 'COMPLETED') {
          return { invoice: existing, actor, alreadyCompleted: true };
        }
        if (existing.status !== 'DRAFT') throw AppError.conflict(DRAFT_ONLY_CONFIRM_MESSAGE);
        if (existing.lines.length === 0) throw AppError.conflict(EMPTY_DRAFT_CONFIRM_MESSAGE);

        for (const line of existing.lines) {
          assertDraftLineTypeEnabled(line.type);
        }

        const customer = await customers.findById(existing.customerId);
        if (!customer) throw AppError.notFound('Customer not found');
        assertFiscalCustomer(customer, existing.fiscal);

        const lineMoney = existing.lines.map((line) => ({
          line,
          money: calculateLineMoney({
            type: line.type,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            fiscal: existing.fiscal,
          }),
        }));
        const totals = sumInvoiceMoney(lineMoney.map((entry) => entry.money));
        const initialPaymentAmount = profile.payment
          ? new Prisma.Decimal(profile.payment.amount)
          : null;
        if (initialPaymentAmount?.greaterThan(totals.gross)) {
          throw AppError.conflict(PAYMENT_EXCEEDS_BALANCE_MESSAGE);
        }
        assertCashCustomerPaidInFull(customer, totals.gross, initialPaymentAmount);
        const number = await sales.allocateNextNumber();
        const confirmedAt = new Date();
        const primaryPhone = customer.contacts.find((contact) => contact.isPrimary)?.phone ?? null;
        let completed = await sales.completeInvoice({
          id,
          number,
          confirmedAt,
          dueDate: invoiceDueDate(confirmedAt),
          customerName: customer.name,
          customerRnc: customer.rnc,
          customerPhone: primaryPhone,
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
        await history.append({
          actor: { actorType: 'USER', actorUserId: actorId },
          subjectType: 'INVOICE',
          subjectId: id,
          eventType: 'INVOICE_CONFIRMED',
          payload: toConfirmedHistorySnapshot(completed),
        });
        if (profile.payment && initialPaymentAmount) {
          const payment = await payments.createPayment({
            invoiceId: id,
            amount: initialPaymentAmount,
            currency: completed.currency,
            method: profile.payment.method,
            effectiveDate: todayBusinessDate(confirmedAt),
            reference: profile.payment.reference ?? null,
            actorUserId: actorId,
            idempotencyKey: profile.payment.idempotencyKey ?? `confirm:${id}`,
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
      await sales.lockById(id);
      let invoice = await sales.findById(id);
      if (!invoice) throw AppError.notFound('Invoice not found');
      if (invoice.status !== 'COMPLETED' || invoice.confirmedAt == null) {
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
      if (invoice.status !== 'COMPLETED') {
        throw AppError.conflict(CANCELLATION_COMPLETED_ONLY_MESSAGE);
      }
      if (!profile.reason) throw AppError.conflict(CANCELLATION_REASON_REQUIRED_MESSAGE);

      const summary = summarizePayments(invoice);
      const netReceived = summary.paid.minus(summary.refunded);
      if (netReceived.greaterThan(0) && !profile.refundMethod) {
        throw AppError.conflict('La cancelación requiere el método del reembolso neto total');
      }

      const cancelledAt = new Date();
      const refund = netReceived.greaterThan(0)
        ? await payments.createRefund({
            invoiceId: id,
            amount: netReceived,
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
          refundAmount: netReceived.toFixed(2),
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
