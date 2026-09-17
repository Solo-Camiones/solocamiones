import { useCallback, useEffect, useState } from 'react';

import type { ProfitabilitySnapshot, RecordManualGrossProfitInput, RetryUsdProfitabilityInput } from '../../api/contracts/profitability';
import { profitabilityRepository } from '../../api/repositories';
import type { AppError, Result } from '../../shared/auth/types';
import { beginQueryReload } from '../../shared/query/begin-query-reload';

type Query =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; snapshot: ProfitabilitySnapshot; isRefreshing: boolean };

export function useProfitability() {
  const [query, setQuery] = useState<Query>({ status: 'loading' });
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQuery(beginQueryReload);

    profitabilityRepository.getSnapshot().then((response) => {
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
  }, []);

  const setFxAvailable = useCallback(async (available: boolean): Promise<Result<void>> => {
    setIsMutating(true);
    const response = await profitabilityRepository.setFxAvailable({ available });
    setIsMutating(false);
    if (!response.ok) {
      return response;
    }
    setQuery({ status: 'ready', snapshot: response.value, isRefreshing: false });
    return { ok: true, value: undefined };
  }, []);

  const retryUsd = useCallback(async (input: RetryUsdProfitabilityInput): Promise<Result<void>> => {
    setIsMutating(true);
    const response = await profitabilityRepository.retryUsd(input);
    setIsMutating(false);
    if (!response.ok) {
      return response;
    }
    setQuery({ status: 'ready', snapshot: response.value, isRefreshing: false });
    return { ok: true, value: undefined };
  }, []);

  const recordManualGrossProfit = useCallback(
    async (input: RecordManualGrossProfitInput): Promise<Result<void>> => {
      setIsMutating(true);
      const response = await profitabilityRepository.recordManualGrossProfit(input);
      setIsMutating(false);
      if (!response.ok) {
        return response;
      }
      setQuery({ status: 'ready', snapshot: response.value, isRefreshing: false });
      return { ok: true, value: undefined };
    },
    [],
  );

  return { query, isMutating, setFxAvailable, retryUsd, recordManualGrossProfit };
}
