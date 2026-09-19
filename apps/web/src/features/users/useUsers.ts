import { useCallback, useEffect, useState } from 'react';

import { toListPage, type ListPage } from '../../api/contracts/pagination';
import type { ManagedUser, SaveUserInput, SaveUserResult } from '../../api/contracts/users';
import { fetchAllPages } from '../../api/client/paginate-all';
import type { AppError, Result } from '../../shared/auth/types';
import { userRepository } from '../../api/repositories';
import { beginQueryReload } from '../../shared/query/begin-query-reload';

type UsersQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | {
      status: 'ready';
      rows: ManagedUser[];
      total: number;
      page: number;
      pageSize: number;
      isRefreshing: boolean;
    };

async function listUsers(page: number, query: string): Promise<Result<ListPage<ManagedUser>>> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return userRepository.list(page);
  }

  let listError: AppError | undefined;
  let pageSize = 10;
  const users = await fetchAllPages(async (currentPage) => {
    if (listError) return { items: [], total: 0 };
    const response = await userRepository.list(currentPage);
    if (!response.ok) {
      listError = response.error;
      return { items: [], total: 0 };
    }
    pageSize = response.value.pageSize;
    return response.value;
  });
  if (listError) return { ok: false, error: listError };

  const matches = users.filter(
    (user) =>
      user.name.toLowerCase().includes(normalized) ||
      user.username.toLowerCase().includes(normalized),
  );
  return { ok: true, value: toListPage(matches, page, pageSize) };
}

/**
 * Loads administrator user management. Features never import seed or user services.
 */
export function useUsers(page: number) {
  const [query, setQuery] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<UsersQuery>({ status: 'loading' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResult(beginQueryReload);

    listUsers(page, query).then((response) => {
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
  }, [query, page, reloadToken]);

  const save = useCallback(async (input: SaveUserInput): Promise<Result<SaveUserResult>> => {
    setIsSaving(true);
    const response = await userRepository.save(input);
    setIsSaving(false);

    if (!response.ok) {
      return response;
    }

    setReloadToken((token) => token + 1);
    return { ok: true, value: response.value };
  }, []);

  return {
    query,
    setQuery,
    result,
    isSaving,
    save,
  };
}
