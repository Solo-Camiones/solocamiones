import { useCallback, useEffect, useState } from 'react';

import type { CustomerListRow, CustomerType, SaveCustomerInput } from '../../api/contracts/customers';
import type { AppError, Result } from '../../shared/auth/types';
import { customerRepository } from '../../api/repositories';
import { beginQueryReload } from '../../shared/query/begin-query-reload';

type CustomersQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | {
      status: 'ready';
      rows: CustomerListRow[];
      total: number;
      page: number;
      pageSize: number;
      isRefreshing: boolean;
    };

/**
 * Loads the customer directory from the repository.
 * Features never import seed or customer services.
 */
export function useCustomers(page: number, customerType?: CustomerType) {
  const [query, setQuery] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<CustomersQuery>({ status: 'loading' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResult(beginQueryReload);

    customerRepository.search(query, page, customerType).then((response) => {
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
        isRefreshing: false,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [query, page, customerType, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const save = useCallback(async (input: SaveCustomerInput): Promise<Result<CustomerListRow['id']>> => {
    setIsSaving(true);
    const response = await customerRepository.save(input);
    setIsSaving(false);

    if (!response.ok) {
      return response;
    }

    setReloadToken((token) => token + 1);
    return { ok: true, value: response.value.id };
  }, []);

  return {
    query,
    setQuery,
    result,
    isSaving,
    save,
    reload,
  };
}
