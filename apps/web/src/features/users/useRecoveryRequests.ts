import { useCallback, useEffect, useState } from 'react';

import { userRepository } from '../../api/repositories';
import type {
  PasswordRecoveryRequest,
  ResolveRecoveryInput,
  ResolveRecoveryResult,
} from '../../api/contracts/users';
import type { AppError, Result } from '../../shared/auth/types';
import { beginQueryReload } from '../../shared/query/begin-query-reload';

export type RecoveryRequestsQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; rows: PasswordRecoveryRequest[]; isRefreshing: boolean };

export function useRecoveryRequests() {
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<RecoveryRequestsQuery>({ status: 'loading' });
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(beginQueryReload);
    userRepository.listRecoveryRequests().then((response) => {
      if (cancelled) return;
      setResult(
        response.ok
          ? { status: 'ready', rows: response.value, isRefreshing: false }
          : { status: 'error', error: response.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const resolve = useCallback(
    async (input: ResolveRecoveryInput): Promise<Result<ResolveRecoveryResult>> => {
      setResolvingId(input.requestId);
      const response = await userRepository.resolveRecovery(input);
      setResolvingId(null);
      if (response.ok) setReloadToken((token) => token + 1);
      return response;
    },
    [],
  );

  return { result, resolvingId, resolve };
}
