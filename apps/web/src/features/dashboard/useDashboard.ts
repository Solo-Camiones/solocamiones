import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import type { DashboardSnapshot } from '../../api/contracts/dashboard';
import type { AppError } from '../../shared/auth/types';
import { dashboardRepository } from '../../api/repositories';
import { beginQueryReload } from '../../shared/query/begin-query-reload';

type DashboardQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; snapshot: DashboardSnapshot; isRefreshing: boolean };

/**
 * Loads the role-projected dashboard snapshot from the repository.
 * Features never import seed or aggregation services.
 */
export function useDashboard(): DashboardQuery {
  const { pathname } = useLocation();
  const [query, setQuery] = useState<DashboardQuery>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setQuery(beginQueryReload);

    dashboardRepository.getSnapshot().then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setQuery({ status: 'error', error: result.error });
        return;
      }

      setQuery({ status: 'ready', snapshot: result.value, isRefreshing: false });
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return query;
}
