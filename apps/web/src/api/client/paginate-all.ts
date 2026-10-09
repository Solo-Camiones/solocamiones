export type PageSlice<T> = {
  items: readonly T[];
  total: number;
};

/**
 * Walks every page of a paginated API until `items.length >= total`.
 * Callers map/filter/sort after the full collection is loaded.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<PageSlice<T>>,
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  let total = 0;

  do {
    const response = await fetchPage(page);
    items.push(...response.items);
    total = response.total;
    if (response.items.length === 0) break;
    page += 1;
  } while (items.length < total);

  return items;
}
