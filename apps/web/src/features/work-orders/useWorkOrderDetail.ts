import { useCallback, useEffect, useState } from 'react';

import type {
  CancelWorkOrderInput,
  ReassignWorkOrderInput,
  WorkOrderCreateOptions,
  WorkOrderDetailView,
} from '../../api/contracts/work-orders';
import type { AppError, Result } from '../../shared/auth/types';
import { workOrderRepository } from '../../api/repositories';

type DetailQuery =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; detail: WorkOrderDetailView };

export function useWorkOrderDetail(id: string | undefined) {
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<DetailQuery>({ status: 'loading' });
  const [createOptions, setCreateOptions] = useState<WorkOrderCreateOptions | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    if (!id) {
      setResult({
        status: 'error',
        error: { code: 'VALIDATION', message: 'Falta el identificador' },
      });
      return;
    }

    let cancelled = false;
    setResult({ status: 'loading' });

    void workOrderRepository.getById(id).then((response) => {
      if (cancelled) {
        return;
      }

      if (!response.ok) {
        setResult({ status: 'error', error: response.error });
        return;
      }

      setResult({ status: 'ready', detail: response.value });
    });

    return () => {
      cancelled = true;
    };
  }, [id, reloadToken]);

  useEffect(() => {
    let cancelled = false;

    void workOrderRepository.getCreateOptions().then((response) => {
      if (cancelled || !response.ok) {
        return;
      }
      setCreateOptions(response.value);
    });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const reassign = useCallback(
    async (input: ReassignWorkOrderInput): Promise<Result<void>> => {
      setIsMutating(true);
      const response = await workOrderRepository.reassign(input);
      setIsMutating(false);
      if (!response.ok) {
        return response;
      }
      reload();
      return { ok: true, value: undefined };
    },
    [reload],
  );

  const cancel = useCallback(
    async (input: CancelWorkOrderInput): Promise<Result<void>> => {
      setIsMutating(true);
      const response = await workOrderRepository.cancel(input);
      setIsMutating(false);
      if (!response.ok) {
        return response;
      }
      reload();
      return { ok: true, value: undefined };
    },
    [reload],
  );

  return {
    result,
    createOptions,
    isMutating,
    reassign,
    cancel,
  };
}
