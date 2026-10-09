/**
 * Keep the last successful list result while a new request is in flight.
 * First load and retries after error still use `status: 'loading'`.
 */
export function beginQueryReload<T extends { status: string }>(
  current: T,
): T | { status: 'loading' } {
  if (current.status === 'ready') {
    return { ...current, isRefreshing: true };
  }

  return { status: 'loading' };
}
