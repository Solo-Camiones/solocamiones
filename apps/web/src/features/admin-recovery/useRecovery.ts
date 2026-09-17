import { useCallback, useEffect, useState } from 'react';

import type { RecoverySnapshot, ReleaseReservationInput } from '../../api/contracts/recovery';
import type { RetryUsdProfitabilityInput } from '../../api/contracts/profitability';
import { recoveryRepository } from '../../api/repositories';
import type { AppError, Result } from '../../shared/auth/types';
import { beginQueryReload } from '../../shared/query/begin-query-reload';

type Query =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; snapshot: RecoverySnapshot; isRefreshing: boolean };

export function useRecovery() {
  const [reloadToken, setReloadToken] = useState(0);
  const [query, setQuery] = useState<Query>({ status: 'loading' });
  const [isMutating, setIsMutating] = useState(false);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setQuery(beginQueryReload);

    recoveryRepository.getSnapshot().then((response) => {
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setQuery({ status: 'error', error: response.error });
        return;
      }
      setQuery({ status: 'ready', snapshot: response.value, isRefreshing: false });
    });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const releaseReservation = useCallback(
    async (input: ReleaseReservationInput): Promise<Result<void>> => {
      setIsMutating(true);
      const response = await recoveryRepository.releaseReservation(input);
      setIsMutating(false);
      if (!response.ok) {
        return response;
      }
      setReloadToken((token) => token + 1);
      return { ok: true, value: undefined };
    },
    [],
  );

  const retryUsd = useCallback(async (input: RetryUsdProfitabilityInput): Promise<Result<void>> => {
    setIsMutating(true);
    const response = await recoveryRepository.retryUsdProfitability(input);
    setIsMutating(false);
    if (!response.ok) {
      return response;
    }
    setQuery({ status: 'ready', snapshot: response.value, isRefreshing: false });
    return { ok: true, value: undefined };
  }, []);

  return { query, isMutating, reload, releaseReservation, retryUsd };
}
