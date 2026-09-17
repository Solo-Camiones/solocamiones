import { useCallback, useEffect, useState } from 'react';

import type { SaveCategoryInput, SaveServiceInput } from '../../api/contracts/catalogs';
import type { Category, Service } from '../../api/contracts/entities';
import type { AppError, Result } from '../../shared/auth/types';
import { categoryRepository, serviceRepository } from '../../api/repositories';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { beginQueryReload } from '../../shared/query/begin-query-reload';

type CatalogTab = 'categories' | 'services';

type CategoriesQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; rows: Category[]; isRefreshing: boolean };

type ServicesQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; rows: Service[]; isRefreshing: boolean };

/**
 * Loads catalogs for the active release. Inventory categories stay off until that
 * capability is on so HTTP R2 never calls the unimplemented category API.
 */
export function useCatalogs() {
  const { inventory } = useAppCapabilities();
  const showCategories = inventory;
  const [tab, setTab] = useState<CatalogTab>(showCategories ? 'categories' : 'services');
  const [reloadToken, setReloadToken] = useState(0);
  const [categories, setCategories] = useState<CategoriesQuery>(
    showCategories ? { status: 'loading' } : { status: 'ready', rows: [], isRefreshing: false },
  );
  const [services, setServices] = useState<ServicesQuery>({ status: 'loading' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setServices(beginQueryReload);
    if (showCategories) {
      setCategories(beginQueryReload);
    } else {
      setCategories({ status: 'ready', rows: [], isRefreshing: false });
      setTab('services');
    }

    const categoryRequest = showCategories
      ? categoryRepository.list()
      : Promise.resolve({ ok: true as const, value: [] as Category[] });

    Promise.all([categoryRequest, serviceRepository.list()]).then(
      ([categoryResponse, serviceResponse]) => {
        if (cancelled) {
          return;
        }

        if (!categoryResponse.ok) {
          setCategories({ status: 'error', error: categoryResponse.error });
        } else {
          setCategories({ status: 'ready', rows: categoryResponse.value, isRefreshing: false });
        }

        if (!serviceResponse.ok) {
          setServices({ status: 'error', error: serviceResponse.error });
        } else {
          setServices({ status: 'ready', rows: serviceResponse.value, isRefreshing: false });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [reloadToken, showCategories]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const saveCategory = useCallback(async (input: SaveCategoryInput): Promise<Result<string>> => {
    setIsSaving(true);
    const response = await categoryRepository.save(input);
    setIsSaving(false);

    if (!response.ok) {
      return response;
    }

    setReloadToken((token) => token + 1);
    return { ok: true, value: response.value.id };
  }, []);

  const saveService = useCallback(async (input: SaveServiceInput): Promise<Result<string>> => {
    setIsSaving(true);
    const response = await serviceRepository.save(input);
    setIsSaving(false);

    if (!response.ok) {
      return response;
    }

    setReloadToken((token) => token + 1);
    return { ok: true, value: response.value.id };
  }, []);

  return {
    tab,
    setTab,
    showCategories,
    categories,
    services,
    isSaving,
    saveCategory,
    saveService,
    reload,
  };
}

export type { CatalogTab };
