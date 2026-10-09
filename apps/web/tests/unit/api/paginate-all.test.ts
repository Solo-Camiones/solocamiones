import { describe, expect, it, vi } from 'vitest';

import { fetchAllPages } from '../../../src/api/client/paginate-all';

describe('fetchAllPages', () => {
  it('walks every page until items cover total', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1, 2], total: 5 })
      .mockResolvedValueOnce({ items: [3, 4], total: 5 })
      .mockResolvedValueOnce({ items: [5], total: 5 });

    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 3);
  });

  it('stops early when a page returns no items', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1], total: 10 })
      .mockResolvedValueOnce({ items: [], total: 10 });

    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
