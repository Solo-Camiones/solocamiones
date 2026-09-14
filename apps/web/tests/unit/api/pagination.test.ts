import { describe, expect, it } from 'vitest';

import {
  LIST_PAGE_SIZE,
  parseListPage,
  setListPageParam,
  toListPage,
} from '../../../src/api/contracts/pagination';

describe('list pagination helpers', () => {
  it('parses a positive integer page and defaults the rest to 1', () => {
    expect(parseListPage(null)).toBe(1);
    expect(parseListPage('2')).toBe(2);
    expect(parseListPage('0')).toBe(1);
    expect(parseListPage('1.5')).toBe(1);
  });

  it('omits page=1 from the query string', () => {
    const params = new URLSearchParams('tab=DRAFT&page=4');
    setListPageParam(params, 1);
    expect(params.get('page')).toBeNull();
    setListPageParam(params, 3);
    expect(params.get('page')).toBe('3');
  });

  it('slices a collection into API-sized pages', () => {
    const items = Array.from({ length: 12 }, (_, index) => index + 1);
    expect(toListPage(items, 1)).toEqual({
      items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      total: 12,
      page: 1,
      pageSize: LIST_PAGE_SIZE,
    });
    expect(toListPage(items, 2).items).toEqual([11, 12]);
  });
});
