import { err, ok, type Result } from '../../shared/auth/types';
import { toAppError } from './http-client';

export const CSRF_HEADERS = { 'X-Requested-With': 'XMLHttpRequest' } as const;

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export async function request<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await operation());
  } catch (error) {
    return err(toAppError(error));
  }
}

export function moneyString(value: number): string {
  return value.toFixed(2);
}
