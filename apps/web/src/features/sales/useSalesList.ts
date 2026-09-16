import { useCallback, useEffect, useState } from 'react';

import { toListPage, type ListPage } from '../../api/contracts/pagination';
import type { SalesListFilters, SalesListRow, SalesListTab } from '../../api/contracts/sales';
import type { PaymentState } from '../../api/contracts/entities';
import type { AppError, Result } from '../../shared/auth/types';
import { salesRepository } from '../../api/repositories';

export const SALES_LIST_TABS: SalesListTab[] = [
  'ALL',
  'DRAFT',
  'QUOTE_DRAFT',
  'QUOTE_ISSUED',
  'COMPLETED',
  'CANCELLED',
];

/** Matches dashboard invoicesToday (`DEMO_NOW_ISO` in the demo clock). */
const DEMO_TODAY = '2026-08-25';

export type SalesUrlFilters = {
  today: boolean;
  outstanding: boolean;
  payments: boolean;
};

const DEFAULT_SALES_URL_FILTERS: SalesUrlFilters = {
  today: false,
  outstanding: false,
  payments: false,
};

/** Dashboard Cobros: paid or partial, including late / overdue variants. */
const COLLECTED_PAYMENT_STATES = new Set<PaymentState>([
  'PAID',
  'PAID_LATE',
  'PARTIALLY_PAID',
  'PARTIALLY_PAID_OVERDUE',
]);

function isCollectedPayment(paymentState: SalesListRow['paymentState']): boolean {
  return paymentState != null && COLLECTED_PAYMENT_STATES.has(paymentState);
}

/**
 * Calendar day of an ISO timestamp — same rule as invoice-money `utcCalendarDate`.
 */
function utcCalendarDate(iso: string): string {
  return iso.slice(0, 10);
}

function isFlagParam(value: string | null): boolean {
  return value === '1';
}

export function parseSalesListTab(value: string | null): SalesListTab | null {
  if (value && SALES_LIST_TABS.includes(value as SalesListTab)) {
    return value as SalesListTab;
  }
  return null;
}

export function parseSalesUrlFilters(params: URLSearchParams): SalesUrlFilters {
  return {
    today: isFlagParam(params.get('today')),
    outstanding: isFlagParam(params.get('outstanding')),
    payments: isFlagParam(params.get('payments')),
  };
}

export function salesUrlFiltersActive(filters: SalesUrlFilters): boolean {
  return filters.today || filters.outstanding || filters.payments;
}

/**
 * Extra list filters from dashboard KPI query params. Combined with the tab
 * (AND). “Today” is the demo calendar day so it matches invoicesToday on Inicio.
 */
export function applySalesUrlFilters(
  rows: SalesListRow[],
  filters: SalesUrlFilters,
  today: string = DEMO_TODAY,
): SalesListRow[] {
  if (!salesUrlFiltersActive(filters)) {
    return rows;
  }

  return rows.filter((row) => {
    if (filters.today) {
      if (
        row.status !== 'COMPLETED' ||
        row.confirmedAt == null ||
        utcCalendarDate(row.confirmedAt) !== today
      ) {
        return false;
      }
    }

    if (filters.outstanding && !(row.status === 'COMPLETED' && (row.balance ?? 0) > 0)) {
      return false;
    }

    if (filters.payments && !isCollectedPayment(row.paymentState)) {
      return false;
    }

    return true;
  });
}

async function listSales(
  tab: SalesListTab,
  page: number,
  q: string,
  filters: SalesUrlFilters,
  listFilters: SalesListFilters,
): Promise<Result<ListPage<SalesListRow>>> {
  if (!salesUrlFiltersActive(filters)) {
    return salesRepository.listInvoices(tab, page, q, listFilters);
  }

  const rows: SalesListRow[] = [];
  let currentPage = 1;
  let total = 0;
  let pageSize = 10;
  do {
    const response = await salesRepository.listInvoices(tab, currentPage, q, listFilters);
    if (!response.ok) return response;
    rows.push(...response.value.items);
    total = response.value.total;
    pageSize = response.value.pageSize;
    currentPage += 1;
  } while (rows.length < total);

  return { ok: true, value: toListPage(applySalesUrlFilters(rows, filters), page, pageSize) };
}

type SalesQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; rows: SalesListRow[]; total: number; page: number; pageSize: number };

export function useSalesList(
  tab: SalesListTab,
  page: number,
  q = '',
  filters: SalesUrlFilters = DEFAULT_SALES_URL_FILTERS,
  listFilters: SalesListFilters = {},
) {
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<SalesQuery>({ status: 'loading' });
  const { today, outstanding, payments } = filters;
  const { dateFrom, dateTo } = listFilters;

  useEffect(() => {
    let cancelled = false;
    setResult({ status: 'loading' });

    listSales(
      tab,
      page,
      q,
      { today, outstanding, payments },
      { dateFrom, dateTo },
    ).then((response) => {
      if (cancelled) {
        return;
      }

      if (!response.ok) {
        setResult({ status: 'error', error: response.error });
        return;
      }

      setResult({
        status: 'ready',
        rows: response.value.items,
        total: response.value.total,
        page: response.value.page,
        pageSize: response.value.pageSize,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    tab,
    page,
    q,
    today,
    outstanding,
    payments,
    dateFrom,
    dateTo,
    reloadToken,
  ]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  return { result, reload };
}
