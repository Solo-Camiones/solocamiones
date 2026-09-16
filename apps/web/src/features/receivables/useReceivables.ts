import { useEffect, useState } from 'react';

import type { ReceivablesFilters, ReceivablesSnapshot } from '../../api/contracts/sales';
import { salesRepository } from '../../api/repositories';
import type { AppError } from '../../shared/auth/types';

type ReceivablesQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; snapshot: ReceivablesSnapshot };

export function useReceivables(page: number, filters: ReceivablesFilters = {}) {
  const [result, setResult] = useState<ReceivablesQuery>({ status: 'loading' });
  const { customerId, invoice } = filters;

  useEffect(() => {
    let cancelled = false;
    setResult({ status: 'loading' });
    salesRepository
      .listReceivables(page, {
        customerId,
        invoice,
      })
      .then((response) => {
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
  }, [page, customerId, invoice]);

  return result;
}
