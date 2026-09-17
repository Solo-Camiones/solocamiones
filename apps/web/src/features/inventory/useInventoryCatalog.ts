import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { Category } from '../../api/contracts/entities';
import type { InventoryListFilters, InventoryListRow } from '../../api/contracts/inventory';
import type { AppError } from '../../shared/auth/types';
import { categoryRepository, inventoryRepository } from '../../api/repositories';
import {
  inventoryFiltersFromSearch,
  inventorySearchFromFilters,
} from './inventory-list-search';
import { beginQueryReload } from '../../shared/query/begin-query-reload';

type CatalogQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; rows: InventoryListRow[]; isRefreshing: boolean };

/**
 * Loads the unified inventory catalog. Filter state lives in the URL so
 * dashboard KPI links (`?available=1`) apply on the first load.
 */
export function useInventoryCatalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  const filters = useMemo(() => inventoryFiltersFromSearch(searchKey), [searchKey]);
  const [result, setResult] = useState<CatalogQuery>({ status: 'loading' });
  const [categories, setCategories] = useState<Category[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    categoryRepository.list().then((response) => {
      if (response.ok) {
        setCategories(response.value);
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setResult(beginQueryReload);

    inventoryRepository.listCatalog(filters).then((response) => {
      if (cancelled) {
        return;
      }

      if (!response.ok) {
        setResult({ status: 'error', error: response.error });
        return;
      }

      setResult({ status: 'ready', rows: response.value, isRefreshing: false });
    });

    return () => {
      cancelled = true;
    };
  }, [filters, reloadToken]);

  const patchFilters = useCallback(
    (patch: Partial<InventoryListFilters>) => {
      setSearchParams(
        (current) => {
          const next = { ...inventoryFiltersFromSearch(current.toString()), ...patch };
          const encoded = inventorySearchFromFilters(next);
          return new URLSearchParams(encoded.startsWith('?') ? encoded.slice(1) : encoded);
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const refresh = useCallback(() => setReloadToken((current) => current + 1), []);

  return { filters, patchFilters, result, categories, refresh };
}
