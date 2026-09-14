import type {
  ProfitabilityInvoiceRow,
  ProfitabilitySnapshot,
  RecordManualGrossProfitInput,
  RetryUsdProfitabilityInput,
} from '../contracts/profitability';
import { err, ok, type Result } from '../../shared/auth/types';
import { httpClient, toAppError } from './http-client';
import {
  canRecordManualGrossProfit,
  toInvoiceProfitabilityView,
  type ApiProfitability,
} from './map-invoice-profitability';
import {
  buildProfitabilitySeries,
  type ProfitabilitySeriesInvoice,
  type ProfitabilitySeriesReceipt,
} from './profitability-series';

const SALES_PATH = '/api/sales';
const PROFITABILITY_PATH = '/api/profitability';
const PAGE_SIZE = 10;
const CSRF_HEADERS = { 'X-Requested-With': 'XMLHttpRequest' };

type ApiCustomerView = {
  id: string;
  name: string;
  rnc: string | null;
  isDefault: boolean;
};

type ApiListPayment = {
  kind: 'PAYMENT' | 'REFUND';
  amount: string;
  method: string;
  effectiveDate: string;
};

type ApiSalesListItem = {
  id: string;
  status: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
  number: string | null;
  currency: 'DOP' | 'USD';
  customer: ApiCustomerView;
  confirmedAt: string | null;
  totals: { gross: string; base: string; itbis: string };
  payments?: ApiListPayment[];
  profitability?: ApiProfitability;
  exchangeRateDopPerUsd?: string | null;
};

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

async function request<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await operation());
  } catch (error) {
    return err(toAppError(error));
  }
}

function moneyString(value: number): string {
  return value.toFixed(2);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function rateFromItem(item: ApiSalesListItem): number | null {
  const raw = item.profitability?.fx?.exchangeRateDopPerUsd ?? item.exchangeRateDopPerUsd;
  if (raw == null || raw === '') return null;
  const rate = Number(raw);
  return Number.isFinite(rate) ? rate : null;
}

function toReceipts(item: ApiSalesListItem): ProfitabilitySeriesReceipt[] {
  return (item.payments ?? []).map((payment) => ({
    kind: payment.kind,
    amount: Number(payment.amount),
    effectiveDate: payment.effectiveDate,
  }));
}

function toRow(item: ApiSalesListItem): ProfitabilityInvoiceRow | null {
  if (item.status !== 'COMPLETED' || item.profitability == null) {
    return null;
  }

  const view = toInvoiceProfitabilityView(item.profitability);
  return {
    id: item.id,
    number: item.number ?? item.id,
    customerName: item.customer.name,
    currency: item.currency,
    total: Number(item.totals.gross),
    profit: view.profit,
    pendingFx: view.pendingFx,
    source: view.source,
    canRecordManual: canRecordManualGrossProfit(item.profitability),
    reason: view.reason,
    rateDopPerUsd: view.rateDopPerUsd,
    href: `/sales/${item.id}`,
    confirmedAt: item.confirmedAt,
  };
}

function toSeriesInvoice(item: ApiSalesListItem): ProfitabilitySeriesInvoice {
  const view = item.profitability ? toInvoiceProfitabilityView(item.profitability) : null;
  return {
    status: item.status,
    currency: item.currency,
    confirmedAt: item.confirmedAt,
    profit: item.status === 'COMPLETED' ? (view?.profit ?? null) : null,
    pendingFx: view?.pendingFx === true,
    rateDopPerUsd: view?.rateDopPerUsd ?? rateFromItem(item),
    receipts: toReceipts(item),
  };
}

function toSnapshot(items: ApiSalesListItem[]): ProfitabilitySnapshot {
  const invoices = items
    .map(toRow)
    .filter((row): row is ProfitabilityInvoiceRow => row != null)
    .sort((left, right) => left.number.localeCompare(right.number, 'es'));
  const series = buildProfitabilitySeries(items.map(toSeriesInvoice));
  return {
    fxAvailable: false,
    fxRateDopPerUsd: 0,
    profitDop: roundMoney(
      invoices
        .filter((row) => row.profit != null && !row.pendingFx)
        .reduce((sum, row) => sum + (row.profit ?? 0), 0),
    ),
    collectedDop: series.collectedDop,
    pendingFxCount: invoices.filter((row) => row.pendingFx).length,
    invoicesMissingProfitCount: series.invoicesMissingProfitCount,
    omittedUsdReceiptCount: series.omittedUsdReceiptCount,
    charts: series.charts,
    invoices,
  };
}

async function loadInvoicesByStatus(
  status: 'COMPLETED' | 'CANCELLED',
): Promise<ApiSalesListItem[]> {
  const items: ApiSalesListItem[] = [];
  let page = 1;
  let total = 0;

  do {
    const params = new URLSearchParams({
      status,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    const response = await httpClient<Page<ApiSalesListItem>>(`${SALES_PATH}?${params.toString()}`);
    items.push(...response.items);
    total = response.total;
    if (response.items.length === 0) break;
    page += 1;
  } while (items.length < total);

  return items;
}

async function loadSnapshotItems(): Promise<ApiSalesListItem[]> {
  const [completed, cancelled] = await Promise.all([
    loadInvoicesByStatus('COMPLETED'),
    loadInvoicesByStatus('CANCELLED'),
  ]);
  return [...completed, ...cancelled];
}

export function getProfitabilitySnapshotWithHttp(): Promise<Result<ProfitabilitySnapshot>> {
  return request(async () => toSnapshot(await loadSnapshotItems()));
}

export function retryUsdProfitabilityWithHttp(
  input: RetryUsdProfitabilityInput,
): Promise<Result<ProfitabilitySnapshot>> {
  return request(async () => {
    await httpClient(`${PROFITABILITY_PATH}/${input.invoiceId}/retry`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({}),
    });
    return toSnapshot(await loadSnapshotItems());
  });
}

export function recordManualGrossProfitWithHttp(
  input: RecordManualGrossProfitInput,
): Promise<Result<ProfitabilitySnapshot>> {
  return request(async () => {
    await httpClient(`${PROFITABILITY_PATH}/${input.invoiceId}/manual-gross-profit`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ profitDop: moneyString(input.profitDop) }),
    });
    return toSnapshot(await loadSnapshotItems());
  });
}
