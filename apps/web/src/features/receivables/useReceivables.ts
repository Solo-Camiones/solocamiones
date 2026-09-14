import { useEffect, useState } from 'react';

import { toListPage } from '../../api/contracts/pagination';
import type { ReceivablesSnapshot } from '../../api/contracts/sales';
import { salesRepository } from '../../api/repositories';
import type { AppError, Result } from '../../shared/auth/types';

type ReceivablesQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; snapshot: ReceivablesSnapshot };

async function listReceivables(
  page: number,
  query: string,
): Promise<Result<ReceivablesSnapshot>> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return salesRepository.listReceivables(page);
  }

  const invoices: ReceivablesSnapshot['invoices'] = [];
  let customers: ReceivablesSnapshot['customers'] = [];
  let currentPage = 1;
  let total = 0;
  let pageSize = 10;
  do {
    const response = await salesRepository.listReceivables(currentPage);
    if (!response.ok) return response;
    invoices.push(...response.value.invoices);
    if (currentPage === 1) customers = response.value.customers;
    total = response.value.total;
    pageSize = response.value.pageSize;
    currentPage += 1;
  } while (invoices.length < total);

  const matches = invoices.filter((invoice) =>
    invoice.customerName.toLowerCase().includes(normalized),
  );
  const paged = toListPage(matches, page, pageSize);
  return {
    ok: true,
    value: {
      invoices: paged.items,
      customers: customers.filter((customer) =>
        customer.customerName.toLowerCase().includes(normalized),
      ),
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    },
  };
}

export function useReceivables(page: number, query = '') {
  const [result, setResult] = useState<ReceivablesQuery>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setResult((current) => (query && current.status === 'ready' ? current : { status: 'loading' }));
    listReceivables(page, query).then((response) => {
      if (cancelled) return;
      if (!response.ok) {
        setResult({ status: 'error', error: response.error });
        return;
      }
      setResult({ status: 'ready', snapshot: response.value });
    });
    return () => {
      cancelled = true;
    };
  }, [page, query]);

  return result;
}
