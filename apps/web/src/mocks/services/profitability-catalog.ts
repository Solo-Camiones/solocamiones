import type {
  ProfitabilityInvoiceRow,
  ProfitabilitySnapshot,
  SaleCondition,
} from '../../api/contracts/profitability';
import type { AppState, Invoice, Payment, User } from '../../api/contracts/entities';
import {
  buildProfitabilitySeries,
  businessDateFromTimestamp,
  type PaymentCollectionMethod,
  type ProfitabilitySeriesInvoice,
  type ProfitabilitySeriesReceipt,
} from '../../api/client/profitability-series';
import { can } from '../../shared/auth/policies';
import { invoiceBalance, invoiceTotal, roundMoney } from './invoice-money';
import { canRecordManualGrossProfit, profitabilityForInvoice } from './profitability-view';

/** Same open-balance rule as the dashboard CxC KPI (per currency, never converted). */
function outstandingByCurrency(state: AppState): { dop: number; usd: number } {
  let dop = 0;
  let usd = 0;

  for (const invoice of state.invoices) {
    const balance = invoiceBalance(invoice);
    if (balance <= 0) {
      continue;
    }
    if (invoice.currency === 'USD') {
      usd += balance;
    } else {
      dop += balance;
    }
  }

  return { dop, usd };
}

const CONFIRMATION_PAYMENT_WINDOW_MS = 5_000;

function customerName(state: AppState, invoice: Invoice): string {
  return (
    invoice.customerSnapshot?.name ??
    state.customers.find((entry) => entry.id === invoice.customerId)?.name ??
    invoice.customerId
  );
}

function toRow(state: AppState, invoice: Invoice, actor: User): ProfitabilityInvoiceRow | null {
  if (invoice.status !== 'COMPLETED') {
    return null;
  }

  const view = profitabilityForInvoice(state, invoice, actor);
  if (!view) {
    return null;
  }

  return {
    id: invoice.id,
    number: invoice.number ?? invoice.id,
    customerName: customerName(state, invoice),
    currency: invoice.currency,
    total: invoiceTotal(invoice),
    profit: view.profit,
    pendingFx: view.pendingFx,
    source: view.source,
    canRecordManual: canRecordManualGrossProfit(invoice, state),
    reason: view.reason,
    rateDopPerUsd: view.rateDopPerUsd,
    href: `/sales/${invoice.id}`,
    confirmedAt: invoice.confirmedAt ?? null,
  };
}

function toCollectionMethod(method: Payment['method']): PaymentCollectionMethod | null {
  if (method === 'CASH' || method === 'TRANSFER' || method === 'CHECK') return method;
  return null;
}

function toReceipt(payment: Payment): ProfitabilitySeriesReceipt | null {
  const method = toCollectionMethod(payment.method);
  if (method == null) return null;
  return {
    kind: payment.kind === 'REFUND' ? 'REFUND' : 'PAYMENT',
    amount: payment.amount,
    method,
    effectiveDate: payment.effectiveDate ?? businessDateFromTimestamp(payment.createdAt),
  };
}

/**
 * Same rule as API DOC-001: full confirm settlement → CASH.
 * Seeds marked PAID without ledger rows are treated as fully settled at confirm.
 */
function saleConditionForInvoice(invoice: Invoice): SaleCondition | null {
  if (invoice.status !== 'COMPLETED' && invoice.status !== 'CANCELLED') return null;

  const gross = invoiceTotal(invoice);
  const confirmKey = `confirm:${invoice.id}`;
  const byKey = invoice.payments.find(
    (payment) =>
      (payment.kind == null || payment.kind === 'PAYMENT') && payment.idempotencyKey === confirmKey,
  );
  let initial: number | null = byKey?.amount ?? null;

  if (initial == null && invoice.confirmedAt != null) {
    const confirmedAtMs = Date.parse(invoice.confirmedAt);
    const nearConfirm = invoice.payments.filter((payment) => {
      if (payment.kind === 'REFUND') return false;
      return Math.abs(Date.parse(payment.createdAt) - confirmedAtMs) <= CONFIRMATION_PAYMENT_WINDOW_MS;
    });
    if (nearConfirm.length > 0) {
      initial = nearConfirm.reduce((sum, payment) => sum + payment.amount, 0);
    }
  }

  // Seed invoices can be PAID without payment rows (e.g. FAC-000096).
  if (initial == null && invoice.payments.length === 0 && invoice.paymentState === 'PAID') {
    return 'CASH';
  }

  if (gross === 0) {
    return initial == null || initial === 0 ? 'CASH' : 'CREDIT';
  }
  return initial != null && roundMoney(initial) === roundMoney(gross) ? 'CASH' : 'CREDIT';
}

function toSeriesInvoice(state: AppState, invoice: Invoice, actor: User): ProfitabilitySeriesInvoice {
  const view = profitabilityForInvoice(state, invoice, actor);
  const receipts: ProfitabilitySeriesReceipt[] = [];
  for (const payment of invoice.payments) {
    const receipt = toReceipt(payment);
    if (receipt) receipts.push(receipt);
  }
  return {
    status: invoice.status,
    currency: invoice.currency,
    confirmedAt: invoice.confirmedAt ?? null,
    saleCondition: saleConditionForInvoice(invoice),
    gross: invoiceTotal(invoice),
    profit: invoice.status === 'COMPLETED' ? (view?.profit ?? null) : null,
    pendingFx: view?.pendingFx === true,
    rateDopPerUsd: view?.rateDopPerUsd ?? invoice.fxRateDopPerUsd ?? null,
    receipts,
  };
}

export function buildProfitabilitySnapshot(
  state: AppState,
  actor: User,
): ProfitabilitySnapshot | undefined {
  if (!can(actor, 'profit.view')) {
    return undefined;
  }

  const invoices = [...state.invoices]
    .map((invoice) => toRow(state, invoice, actor))
    .filter((row): row is ProfitabilityInvoiceRow => row != null)
    .sort((left, right) => left.number.localeCompare(right.number, 'es'));

  const series = buildProfitabilitySeries(
    state.invoices.map((invoice) => toSeriesInvoice(state, invoice, actor)),
  );
  const outstanding = outstandingByCurrency(state);

  return {
    fxAvailable: state.fxAvailable,
    fxRateDopPerUsd: state.fxRateDopPerUsd,
    profitDop: roundMoney(
      invoices
        .filter((row) => row.profit != null && !row.pendingFx)
        .reduce((sum, row) => sum + (row.profit ?? 0), 0),
    ),
    collectedDop: series.collectedDop,
    outstandingDop: outstanding.dop,
    outstandingUsd: outstanding.usd,
    pendingFxCount: invoices.filter((row) => row.pendingFx).length,
    invoicesMissingProfitCount: series.invoicesMissingProfitCount,
    omittedUsdReceiptCount: series.omittedUsdReceiptCount,
    charts: series.charts,
    invoices,
  };
}
