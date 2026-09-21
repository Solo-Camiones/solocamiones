import type {

  ProfitabilityInvoiceRow,

  ProfitabilitySnapshot,

  RecordManualGrossProfitInput,

  RetryUsdProfitabilityInput,

  SaleCondition,

} from '../contracts/profitability';

import type { Result } from '../../shared/auth/types';

import {

  assembleProfitabilitySnapshot,

  toCollectionMethod,

} from './assemble-profitability-snapshot';

import { httpClient } from './http-client';

import { CSRF_HEADERS, moneyString, request, type Page } from './http-result';

import {

  canRecordManualGrossProfit,

  toInvoiceProfitabilityView,

  type ApiProfitability,

} from './map-invoice-profitability';

import { fetchAllPages } from './paginate-all';

import {

  roundMoney,

  type ProfitabilitySeriesInvoice,

  type ProfitabilitySeriesReceipt,

} from './profitability-series';



const SALES_PATH = '/api/sales';

const PROFITABILITY_PATH = '/api/profitability';

const PAGE_SIZE = 10;



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

  status: 'DRAFT' | 'CONDUCE' | 'COMPLETED' | 'CANCELLED';

  number: string | null;

  conduceNumber?: string | null;

  currency: 'DOP' | 'USD';

  customer: ApiCustomerView;

  confirmedAt: string | null;

  saleCondition?: SaleCondition;

  totals: { gross: string; base: string; itbis: string };

  payments?: ApiListPayment[];

  profitability?: ApiProfitability;

  exchangeRateDopPerUsd?: string | null;

};



function rateFromItem(item: ApiSalesListItem): number | null {

  const raw = item.profitability?.fx?.exchangeRateDopPerUsd ?? item.exchangeRateDopPerUsd;

  if (raw == null || raw === '') return null;

  const rate = Number(raw);

  return Number.isFinite(rate) ? rate : null;

}



function toReceipts(item: ApiSalesListItem): ProfitabilitySeriesReceipt[] {

  const receipts: ProfitabilitySeriesReceipt[] = [];

  for (const payment of item.payments ?? []) {

    const method = toCollectionMethod(payment.method);

    if (method == null) continue;

    receipts.push({

      kind: payment.kind,

      amount: Number(payment.amount),

      method,

      effectiveDate: payment.effectiveDate,

    });

  }

  return receipts;

}



function toRow(item: ApiSalesListItem): ProfitabilityInvoiceRow | null {

  if (
    (item.status !== 'COMPLETED' && item.status !== 'CONDUCE') ||
    item.profitability == null
  ) {

    return null;

  }



  const view = toInvoiceProfitabilityView(item.profitability);

  return {

    id: item.id,

    number: item.number ?? item.conduceNumber ?? item.id,

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

    saleCondition: item.saleCondition ?? null,

    gross: Number(item.totals.gross),

    profit:
      item.status === 'COMPLETED' || item.status === 'CONDUCE' ? (view?.profit ?? null) : null,

    pendingFx: view?.pendingFx === true,

    rateDopPerUsd: view?.rateDopPerUsd ?? rateFromItem(item),

    receipts: toReceipts(item),

  };

}



type ApiReceivablesCustomers = {

  customers: Array<{ currency: 'DOP' | 'USD'; balance: string }>;

};



function outstandingFromCustomers(

  customers: ApiReceivablesCustomers['customers'],

): Pick<ProfitabilitySnapshot, 'outstandingDop' | 'outstandingUsd'> {

  let outstandingDop = 0;

  let outstandingUsd = 0;

  for (const row of customers) {

    const balance = Number(row.balance);

    if (!Number.isFinite(balance) || balance <= 0) continue;

    if (row.currency === 'USD') {

      outstandingUsd = roundMoney(outstandingUsd + balance);

    } else {

      outstandingDop = roundMoney(outstandingDop + balance);

    }

  }

  return { outstandingDop, outstandingUsd };

}



function toSnapshot(

  items: ApiSalesListItem[],

  outstanding: Pick<ProfitabilitySnapshot, 'outstandingDop' | 'outstandingUsd'>,

): ProfitabilitySnapshot {

  return assembleProfitabilitySnapshot({

    invoices: items

      .map(toRow)

      .filter((row): row is ProfitabilityInvoiceRow => row != null),

    seriesInputs: items.map(toSeriesInvoice),

    outstanding,

  });

}



async function loadInvoicesByStatus(

  status: 'COMPLETED' | 'CONDUCE' | 'CANCELLED',

): Promise<ApiSalesListItem[]> {

  return fetchAllPages(async (page) => {

    const params = new URLSearchParams({

      status,

      page: String(page),

      pageSize: String(PAGE_SIZE),

    });

    return httpClient<Page<ApiSalesListItem>>(`${SALES_PATH}?${params.toString()}`);

  });

}



async function loadSnapshotItems(): Promise<ApiSalesListItem[]> {

  // CON-006: recognized sales are COMPLETED and CONDUCE; both count once toward KPIs.
  const [completed, conduces, cancelled] = await Promise.all([

    loadInvoicesByStatus('COMPLETED'),

    loadInvoicesByStatus('CONDUCE'),

    loadInvoicesByStatus('CANCELLED'),

  ]);

  return [...completed, ...conduces, ...cancelled];

}



/** Customer outstanding summary is unpaginated; page params only size the invoice list. */

async function loadOutstanding(): Promise<

  Pick<ProfitabilitySnapshot, 'outstandingDop' | 'outstandingUsd'>

> {

  const params = new URLSearchParams({

    page: '1',

    pageSize: String(PAGE_SIZE),

  });

  const response = await httpClient<ApiReceivablesCustomers>(

    `${SALES_PATH}/receivables?${params.toString()}`,

  );

  return outstandingFromCustomers(response.customers);

}



async function buildSnapshot(): Promise<ProfitabilitySnapshot> {

  const [items, outstanding] = await Promise.all([loadSnapshotItems(), loadOutstanding()]);

  return toSnapshot(items, outstanding);

}



export function getProfitabilitySnapshotWithHttp(): Promise<Result<ProfitabilitySnapshot>> {

  return request(buildSnapshot);

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

    return buildSnapshot();

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

    return buildSnapshot();

  });

}

