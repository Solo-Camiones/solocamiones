export const LIST_PAGE_SIZE = 10;

export type ListPage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function parseListPage(value: string | null): number {
  if (value == null || value.trim() === '') {
    return 1;
  }
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export function setListPageParam(params: URLSearchParams, page: number): void {
  if (page <= 1) {
    params.delete('page');
    return;
  }
  params.set('page', String(page));
}

export function toListPage<T>(
  items: readonly T[],
  page = 1,
  pageSize = LIST_PAGE_SIZE,
): ListPage<T> {
  const current = Math.max(1, page);
  const start = (current - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page: current,
    pageSize,
  };
}
