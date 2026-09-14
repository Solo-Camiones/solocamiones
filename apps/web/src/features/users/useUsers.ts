import { useCallback, useEffect, useState } from 'react';

import { toListPage, type ListPage } from '../../api/contracts/pagination';
import type { ManagedUser, SaveUserInput, SaveUserResult } from '../../api/contracts/users';
import type { AppError, Result } from '../../shared/auth/types';
import { userRepository } from '../../api/repositories';

type UsersQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; rows: ManagedUser[]; total: number; page: number; pageSize: number };

async function listUsers(page: number, query: string): Promise<Result<ListPage<ManagedUser>>> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return userRepository.list(page);
  }

  const users: ManagedUser[] = [];
  let currentPage = 1;
  let total = 0;
  let pageSize = 10;
  do {
    const response = await userRepository.list(currentPage);
    if (!response.ok) return response;
    users.push(...response.value.items);
    total = response.value.total;
    pageSize = response.value.pageSize;
    currentPage += 1;
  } while (users.length < total);

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
    setResult({ status: 'loading' });

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
