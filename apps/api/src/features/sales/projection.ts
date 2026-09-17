import { Prisma, type InvoiceLine } from '@prisma/client';

import { MONEY_DECIMAL_PLACES } from './money/constants.js';
import {
  calculateLineMoney,
  calculateLineProfitDop,
  calculateLineProfitUsdReportingDop,
  calculatedCompletedProfitability,
  isTaxableLineType,
  reportedInvoiceProfitability,
  sumInvoiceMoney,
} from './money/index.js';
import { PROFITABILITY_REASONS, type Profitability } from './money/types.js';
import { databaseDateString } from '../payments/dates.js';
import { summarizePayments } from '../payments/summary.js';
import { isQuoteExpired } from './quote-dates.js';
import type { InvoiceHistoryEntryView } from '../history/invoice-timeline.js';
import type {
  InvoiceConfirmedHistorySnapshot,
  InvoiceCustomerSnapshot,
  InvoiceDraftHistorySnapshot,
  InvoiceLineHistorySnapshot,
  InvoiceListRecord,
  InvoiceRecord,
  InvoiceViewer,
  InvoiceUsdFxRecordedHistorySnapshot,
  InvoiceUsdFxRetryHistorySnapshot,
  PublicFxProvenance,
  PublicInvoice,
  PublicInvoiceDocument,
  PublicInvoiceLine,
  PublicCustomerOutstanding,
  PublicInvoiceListItem,
  PublicInvoiceListPayment,
  PublicProfitability,
  PublicReceivableInvoice,
  PublicReceivables,
} from './types.js';
import {
  moneyString as decimalMoneyString,
  type CustomerOutstanding,
} from '../payments/receivables.js';

function moneyString(value: { toFixed(places: number): string }): string {
  return value.toFixed(MONEY_DECIMAL_PLACES);
}

function toPublicFxProvenance(
  invoice: InvoiceRecord | InvoiceListRecord,
): PublicFxProvenance | undefined {
  if (
    invoice.exchangeRateDopPerUsd == null ||
    invoice.fxRateSource == null ||
    invoice.fxRateUpdatedAt == null ||
    invoice.fxRateObtainedAt == null
  ) {
    return undefined;
  }
  return {
    exchangeRateDopPerUsd: invoice.exchangeRateDopPerUsd.toString(),
    source: invoice.fxRateSource,
    rateUpdatedAt: invoice.fxRateUpdatedAt.toISOString(),
    obtainedAt: invoice.fxRateObtainedAt.toISOString(),
  };
}

function toPublicProfitability(value: Profitability, fx?: PublicFxProvenance): PublicProfitability {
  return {
    status: value.status,
    reason: value.reason,
    profitDop: value.profitDop == null ? null : moneyString(value.profitDop),
    margin: value.margin == null ? null : moneyString(value.margin),
    ...(fx ? { fx } : {}),
  };
}

function customerSnapshotOf(
  invoice: InvoiceRecord | InvoiceListRecord,
): InvoiceCustomerSnapshot | null {
  if (
    invoice.status === 'DRAFT' ||
    invoice.status === 'QUOTE_DRAFT' ||
    invoice.customerName == null
  )
    return null;
  return { name: invoice.customerName, rnc: invoice.customerRnc, phone: invoice.customerPhone };
}

function toCustomerView(invoice: InvoiceRecord | InvoiceListRecord) {
  const snapshot = customerSnapshotOf(invoice);
  const completed = invoice.status === 'COMPLETED' || invoice.status === 'CANCELLED';
  return {
    id: invoice.customer.id,
    name: snapshot?.name ?? invoice.customer.name,
    rnc: snapshot ? snapshot.rnc : invoice.customer.rnc,
    isDefault: invoice.customer.isDefault,
    customerType: completed
      ? (invoice.snapshotCustomerType ?? invoice.customer.customerType)
      : invoice.customer.customerType,
    creditTermDays: completed ? invoice.snapshotCreditTermDays : invoice.customer.creditTermDays,
    creditLimitDop:
      completed || invoice.customer.creditLimitDop == null
        ? null
        : moneyString(invoice.customer.creditLimitDop),
  };
}

function administratorLedger<T extends object>(
  viewer: InvoiceViewer,
  fields: T,
): T | Record<string, never> {
  return viewer.role === 'ADMINISTRATOR' ? fields : {};
}

function persistedLineMoney(line: InvoiceLine) {
  if (line.gross == null || line.base == null || line.itbis == null) return null;
  return { gross: line.gross, base: line.base, itbis: line.itbis };
}

function lineProfitInput(line: InvoiceLine) {
  return {
    type: line.type,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    base: line.base,
    gross: line.gross,
    acquisitionCostDop: line.acquisitionCostDop,
    costProvenance: line.costProvenance,
  };
}

function invoiceSellingPrice(invoice: InvoiceRecord | InvoiceListRecord): Prisma.Decimal {
  if (invoice.applyItbis && invoice.base != null) return invoice.base;
  if (invoice.gross != null) return invoice.gross;
  const totals = invoiceTotals(invoice);
  return new Prisma.Decimal(invoice.applyItbis ? totals.base : totals.gross);
}

function invoiceSellingPriceDop(invoice: InvoiceRecord | InvoiceListRecord): Prisma.Decimal {
  const sellingPrice = invoiceSellingPrice(invoice);
  if (invoice.currency !== 'USD' || invoice.exchangeRateDopPerUsd == null) return sellingPrice;
  return sellingPrice.times(invoice.exchangeRateDopPerUsd);
}

function deriveCompletedProfitability(invoice: InvoiceRecord | InvoiceListRecord): {
  invoice: PublicProfitability;
  lines: PublicProfitability[];
} | null {
  const lineInputs = invoice.lines.map(lineProfitInput);
  const calculated = calculatedCompletedProfitability({
    status: invoice.status,
    currency: invoice.currency,
    applyItbis: invoice.applyItbis,
    lines: lineInputs,
    exchangeRateDopPerUsd: invoice.exchangeRateDopPerUsd,
  });
  const reported = reportedInvoiceProfitability(
    calculated,
    invoice.manualGrossProfitDop,
    invoiceSellingPriceDop(invoice),
  );
  if (reported == null) return null;

  const fx = toPublicFxProvenance(invoice);
  if (reported.reason === PROFITABILITY_REASONS.PENDING_FX_RATE) {
    const pendingFx = toPublicProfitability(reported);
    return {
      invoice: pendingFx,
      lines: invoice.lines.map(() => pendingFx),
    };
  }

  const lineProfit =
    invoice.currency === 'USD' && invoice.exchangeRateDopPerUsd != null
      ? (input: (typeof lineInputs)[number]) =>
          calculateLineProfitUsdReportingDop(
            input,
            invoice.applyItbis,
            invoice.exchangeRateDopPerUsd!,
          )
      : (input: (typeof lineInputs)[number]) => calculateLineProfitDop(input, invoice.applyItbis);

  return {
    invoice: toPublicProfitability(reported, fx),
    lines: lineInputs.map((input) => toPublicProfitability(lineProfit(input))),
  };
}

export function toManualGrossProfitHistorySnapshot(
  before: { toFixed(places: number): string } | null,
  after: { toFixed(places: number): string },
) {
  return {
    before: before == null ? null : moneyString(before),
    after: moneyString(after),
  };
}

export function toUsdFxRetryHistorySnapshot(input: {
  outcome: 'RECORDED' | 'UNAVAILABLE';
  reason: string | null;
  asOf: Date;
  after: {
    exchangeRateDopPerUsd: { toString(): string };
    source: string;
    rateUpdatedAt: Date;
    obtainedAt: Date;
  } | null;
}): InvoiceUsdFxRetryHistorySnapshot {
  return {
    outcome: input.outcome,
    reason: input.reason,
    asOf: input.asOf.toISOString(),
    after:
      input.after == null
        ? null
        : {
            exchangeRateDopPerUsd: input.after.exchangeRateDopPerUsd.toString(),
            source: input.after.source,
            rateUpdatedAt: input.after.rateUpdatedAt.toISOString(),
            obtainedAt: input.after.obtainedAt.toISOString(),
          },
  };
}

export function toUsdFxRecordedHistorySnapshot(input: {
  asOf: Date;
  after: {
    exchangeRateDopPerUsd: { toString(): string };
    source: string;
    rateUpdatedAt: Date;
    obtainedAt: Date;
  };
}): InvoiceUsdFxRecordedHistorySnapshot {
  return {
    asOf: input.asOf.toISOString(),
    after: {
      exchangeRateDopPerUsd: input.after.exchangeRateDopPerUsd.toString(),
      source: input.after.source,
      rateUpdatedAt: input.after.rateUpdatedAt.toISOString(),
      obtainedAt: input.after.obtainedAt.toISOString(),
    },
  };
}

function administratorProfitability(
  invoice: InvoiceRecord | InvoiceListRecord,
  viewer: InvoiceViewer,
) {
  if (viewer.role !== 'ADMINISTRATOR') return null;
  return deriveCompletedProfitability(invoice);
}

function toPublicInvoiceDocument(
  invoice: InvoiceRecord | InvoiceListRecord,
): PublicInvoiceDocument | undefined {
  if (
    invoice.status === 'DRAFT' ||
    invoice.status === 'QUOTE_DRAFT' ||
    invoice.status === 'QUOTE_ISSUED' ||
    invoice.pdfStatus == null
  )
    return undefined;
  if (invoice.pdfStatus === 'FAILED') {
    if (invoice.pdfErrorId == null) return undefined;
    return { status: 'FAILED', errorId: invoice.pdfErrorId };
  }
  return { status: 'READY' };
}

function toPublicLine(
  line: InvoiceLine,
  applyItbis: boolean,
  profitability?: PublicProfitability,
): PublicInvoiceLine {
  const money =
    persistedLineMoney(line) ??
    calculateLineMoney({
      type: line.type,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      applyItbis,
    });
  return {
    id: line.id,
    type: line.type,
    description: line.description,
    notes: line.notes,
    quantity: moneyString(line.quantity),
    unitPrice: moneyString(line.unitPrice),
    taxable: isTaxableLineType(line.type),
    gross: moneyString(money.gross),
    base: moneyString(money.base),
    itbis: moneyString(money.itbis),
    serviceId: line.serviceId,
    ...(profitability ? { profitability } : {}),
  };
}

function invoiceTotals(invoice: InvoiceRecord | InvoiceListRecord) {
  if (invoice.gross != null && invoice.base != null && invoice.itbis != null) {
    return {
      gross: moneyString(invoice.gross),
      base: moneyString(invoice.base),
      itbis: moneyString(invoice.itbis),
    };
  }
  const totals = sumInvoiceMoney(
    invoice.lines.map((line) =>
      calculateLineMoney({
        type: line.type,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        applyItbis: invoice.applyItbis,
      }),
    ),
  );
  return {
    gross: moneyString(totals.gross),
    base: moneyString(totals.base),
    itbis: moneyString(totals.itbis),
  };
}

export function toPublicInvoice(
  invoice: InvoiceRecord,
  viewer: InvoiceViewer,
  history: InvoiceHistoryEntryView[] = [],
): PublicInvoice {
  const profitability = administratorProfitability(invoice, viewer);
  const document = toPublicInvoiceDocument(invoice);
  const completed = invoice.status === 'COMPLETED' || invoice.status === 'CANCELLED';
  const payment = completed ? summarizePayments(invoice) : null;
  return {
    id: invoice.id,
    status: invoice.status,
    number: invoice.number,
    quoteNumber: invoice.quoteNumber,
    quoteIssuedAt: invoice.quoteIssuedAt?.toISOString() ?? null,
    quoteExpiresAt: invoice.quoteExpiresAt?.toISOString() ?? null,
    quoteExpired: isQuoteExpired(invoice.quoteExpiresAt),
    currency: invoice.currency,
    fiscal: invoice.fiscal,
    applyItbis: invoice.applyItbis,
    customer: toCustomerView(invoice),
    customerSnapshot: customerSnapshotOf(invoice),
    confirmedAt: invoice.confirmedAt?.toISOString() ?? null,
    dueDate: invoice.dueDate ? databaseDateString(invoice.dueDate) : null,
    sellerName: invoice.confirmedByName,
    cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
    cancelReason: invoice.cancelReason,
    cancelledByName: invoice.cancelledByName,
    ...(payment
      ? administratorLedger(viewer, {
          paymentState: payment.state,
          payments: invoice.payments.map((entry) => ({
            id: entry.id,
            kind: entry.kind,
            amount: moneyString(entry.amount),
            method: entry.method,
            effectiveDate: databaseDateString(entry.effectiveDate),
            recordedAt: entry.createdAt.toISOString(),
            reference: entry.reference,
            actorName: entry.actor.name,
          })),
          paid: moneyString(payment.paid),
          refunded: moneyString(payment.refunded),
          balance: moneyString(payment.balance),
        })
      : {}),
    lines: invoice.lines.map((line, index) =>
      toPublicLine(line, invoice.applyItbis, profitability?.lines[index]),
    ),
    totals: invoiceTotals(invoice),
    ...(profitability ? { profitability: profitability.invoice } : {}),
    ...(document ? { document } : {}),
    history,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}

function toPublicListPayments(invoice: InvoiceListRecord): PublicInvoiceListPayment[] {
  return invoice.payments.map((entry) => ({
    kind: entry.kind,
    amount: moneyString(entry.amount),
    method: entry.method,
    effectiveDate: databaseDateString(entry.effectiveDate),
  }));
}

export function toPublicInvoiceListItem(
  invoice: InvoiceListRecord,
  viewer: InvoiceViewer,
  now = new Date(),
): PublicInvoiceListItem {
  const profitability = administratorProfitability(invoice, viewer);
  const completed = invoice.status === 'COMPLETED' || invoice.status === 'CANCELLED';
  const payment = completed ? summarizePayments(invoice, now) : null;
  const storedRate =
    viewer.role === 'ADMINISTRATOR' && invoice.exchangeRateDopPerUsd != null
      ? invoice.exchangeRateDopPerUsd.toString()
      : undefined;
  return {
    id: invoice.id,
    status: invoice.status,
    number: invoice.number,
    quoteNumber: invoice.quoteNumber,
    quoteIssuedAt: invoice.quoteIssuedAt?.toISOString() ?? null,
    quoteExpiresAt: invoice.quoteExpiresAt?.toISOString() ?? null,
    quoteExpired: isQuoteExpired(invoice.quoteExpiresAt),
    currency: invoice.currency,
    fiscal: invoice.fiscal,
    applyItbis: invoice.applyItbis,
    customer: toCustomerView(invoice),
    customerSnapshot: customerSnapshotOf(invoice),
    confirmedAt: invoice.confirmedAt?.toISOString() ?? null,
    dueDate: invoice.dueDate ? databaseDateString(invoice.dueDate) : null,
    ...(payment
      ? administratorLedger(viewer, {
          paymentState: payment.state,
          payments: toPublicListPayments(invoice),
          balance: moneyString(payment.balance),
        })
      : {}),
    totals: invoiceTotals(invoice),
    ...(profitability ? { profitability: profitability.invoice } : {}),
    ...(storedRate ? { exchangeRateDopPerUsd: storedRate } : {}),
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}

function toPublicCustomerOutstanding(row: CustomerOutstanding): PublicCustomerOutstanding {
  return {
    customerId: row.customerId,
    customerName: row.customerName,
    currency: row.currency,
    invoiceCount: row.invoiceCount,
    invoiced: decimalMoneyString(row.invoiced),
    paid: decimalMoneyString(row.paid),
    balance: decimalMoneyString(row.balance),
  };
}

export function toPublicReceivables(
  invoiceRecords: InvoiceListRecord[],
  customers: CustomerOutstanding[],
  viewer: InvoiceViewer,
  now: Date,
  page: number,
  pageSize: number,
  total = invoiceRecords.length,
): PublicReceivables {
  const invoices: PublicReceivableInvoice[] = invoiceRecords.map((invoice) => ({
    ...toPublicInvoiceListItem(invoice, viewer, now),
    paid: decimalMoneyString(summarizePayments(invoice, now).paid),
  }));
  return {
    invoices,
    customers: customers.map(toPublicCustomerOutstanding),
    total,
    page,
    pageSize,
  };
}

export function toDraftHistorySnapshot(invoice: {
  currency: InvoiceRecord['currency'];
  fiscal: boolean;
  customerId: string;
}): InvoiceDraftHistorySnapshot {
  return {
    status: 'DRAFT',
    number: null,
    currency: invoice.currency,
    fiscal: invoice.fiscal,
    customerId: invoice.customerId,
  };
}

export function toConfirmedHistorySnapshot(
  invoice: InvoiceRecord,
): InvoiceConfirmedHistorySnapshot {
  const snapshot = customerSnapshotOf(invoice);
  if (
    invoice.number == null ||
    invoice.confirmedAt == null ||
    invoice.dueDate == null ||
    invoice.confirmedByUserId == null ||
    invoice.confirmedByName == null ||
    snapshot == null
  ) {
    throw new Error('Confirmed invoice is missing snapshot fields');
  }
  return {
    status: 'COMPLETED',
    number: invoice.number,
    currency: invoice.currency,
    fiscal: invoice.fiscal,
    customerId: invoice.customerId,
    customerSnapshot: snapshot,
    totals: invoiceTotals(invoice),
    confirmedAt: invoice.confirmedAt.toISOString(),
    dueDate: databaseDateString(invoice.dueDate),
    confirmedByUserId: invoice.confirmedByUserId,
    confirmedByName: invoice.confirmedByName,
  };
}

export function toLineHistorySnapshot(line: InvoiceLine): InvoiceLineHistorySnapshot {
  return {
    id: line.id,
    type: line.type,
    description: line.description,
    notes: line.notes ?? null,
    quantity: moneyString(line.quantity),
    unitPrice: moneyString(line.unitPrice),
    acquisitionCostDop:
      line.acquisitionCostDop == null ? null : moneyString(line.acquisitionCostDop),
    costProvenance: line.costProvenance,
    serviceId: line.serviceId,
  };
}
