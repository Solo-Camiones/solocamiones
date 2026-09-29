// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProfitabilitySnapshot } from '../../../../src/api/contracts/profitability';
import { err, ok } from '../../../../src/shared/auth/types';
import { useProfitability } from '../../../../src/features/profitability/useProfitability';

const repository = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  setFxAvailable: vi.fn(),
  retryUsd: vi.fn(),
  recordManualGrossProfit: vi.fn(),
}));

vi.mock('../../../../src/api/repositories', () => ({
  profitabilityRepository: repository,
}));

const snapshot = { fxAvailable: false } as ProfitabilitySnapshot;
const refreshedSnapshot = { fxAvailable: true } as ProfitabilitySnapshot;

describe('useProfitability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.getSnapshot.mockResolvedValue(ok(snapshot));
  });

  it('loads the snapshot and applies every successful command response', async () => {
    repository.setFxAvailable.mockResolvedValue(ok(refreshedSnapshot));
    repository.retryUsd.mockResolvedValue(ok(snapshot));
    repository.recordManualGrossProfit.mockResolvedValue(ok(refreshedSnapshot));
    const { result } = renderHook(() => useProfitability());

    await waitFor(() => expect(result.current.query.status).toBe('ready'));

    await act(async () => {
      await expect(result.current.setFxAvailable(true)).resolves.toEqual(ok(undefined));
    });
    expect(result.current.query).toEqual({
      status: 'ready',
      snapshot: refreshedSnapshot,
      isRefreshing: false,
    });

    await act(async () => {
      await expect(result.current.retryUsd({ invoiceId: 'invoice-1' })).resolves.toEqual(
        ok(undefined),
      );
      await expect(
        result.current.recordManualGrossProfit({ invoiceId: 'invoice-1', profitDop: 100 }),
      ).resolves.toEqual(ok(undefined));
    });

    expect(repository.setFxAvailable).toHaveBeenCalledWith({ available: true });
    expect(repository.retryUsd).toHaveBeenCalledWith({ invoiceId: 'invoice-1' });
    expect(repository.recordManualGrossProfit).toHaveBeenCalledWith({
      invoiceId: 'invoice-1',
      profitDop: 100,
    });
    expect(result.current.isMutating).toBe(false);
  });

  it('exposes query and command failures without replacing the current snapshot', async () => {
    const appError = { code: 'FORBIDDEN' as const, message: 'Sin permiso' };
    const failure = err(appError);
    repository.getSnapshot.mockResolvedValue(failure);
    repository.setFxAvailable.mockResolvedValue(failure);
    repository.retryUsd.mockResolvedValue(failure);
    repository.recordManualGrossProfit.mockResolvedValue(failure);
    const { result } = renderHook(() => useProfitability());

    await waitFor(() => expect(result.current.query).toEqual({ status: 'error', error: appError }));

    await act(async () => {
      await expect(result.current.setFxAvailable(false)).resolves.toEqual(failure);
      await expect(result.current.retryUsd({ invoiceId: 'invoice-1' })).resolves.toEqual(failure);
      await expect(
        result.current.recordManualGrossProfit({ invoiceId: 'invoice-1', profitDop: 100 }),
      ).resolves.toEqual(failure);
    });
    expect(result.current.query.status).toBe('error');
    expect(result.current.isMutating).toBe(false);
  });

  it('ignores a snapshot that resolves after unmount', async () => {
    let resolveSnapshot!: (value: ReturnType<typeof ok<ProfitabilitySnapshot>>) => void;
    repository.getSnapshot.mockReturnValue(
      new Promise((resolve) => {
        resolveSnapshot = resolve;
      }),
    );
    const { result, unmount } = renderHook(() => useProfitability());
    expect(result.current.query.status).toBe('loading');

    unmount();
    await act(async () => resolveSnapshot(ok(snapshot)));

    expect(repository.getSnapshot).toHaveBeenCalledOnce();
  });
});
