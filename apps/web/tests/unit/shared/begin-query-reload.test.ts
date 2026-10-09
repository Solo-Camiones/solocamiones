import { describe, expect, it } from 'vitest';

import { beginQueryReload } from '../../../src/shared/query/begin-query-reload';

describe('beginQueryReload', () => {
  it('keeps ready data and marks a refresh', () => {
    const current = { status: 'ready' as const, rows: ['a'], isRefreshing: false };

    expect(beginQueryReload(current)).toEqual({
      status: 'ready',
      rows: ['a'],
      isRefreshing: true,
    });
  });

  it('uses a full loading state when there is no ready snapshot', () => {
    expect(beginQueryReload({ status: 'loading' as const })).toEqual({ status: 'loading' });
    expect(beginQueryReload({ status: 'error' as const, error: { message: 'fail' } })).toEqual({
      status: 'loading',
    });
  });
});
