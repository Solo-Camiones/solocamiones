import type { Category } from '../../api/contracts/entities';
import { err, ok, type Result } from '../../shared/auth/types';

/**
 * Prototype pad matches seed codes such as MOT-001.
 * Production (Release 4) uses six digits, same idea as FAC-000001.
 */
export const ITEM_CODE_PAD = 3;

const PREFIX_PATTERN = /^[A-Z][A-Z0-9]{1,7}$/;

export function formatItemCode(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(ITEM_CODE_PAD, '0')}`;
}

export function normalizeCodePrefix(value: string | undefined): Result<string> {
  const prefix = value?.trim().toUpperCase() ?? '';
  if (!PREFIX_PATTERN.test(prefix)) {
    return err({
      code: 'VALIDATION',
      message: 'El prefijo debe tener 2 a 8 caracteres (A–Z, luego A–Z o dígitos)',
    });
  }
  return ok(prefix);
}

function prefixPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i');
}

export function maxSequenceForPrefix(ids: string[], prefix: string): number {
  const pattern = prefixPattern(prefix);
  let max = 0;
  for (const id of ids) {
    const match = pattern.exec(id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return max;
}

/** Next unused number per category, never derived from MAX at allocation time. */
export function buildItemCodeSeq(
  categories: Category[],
  itemIds: string[],
): Record<string, number> {
  const seq: Record<string, number> = {};
  for (const category of categories) {
    seq[category.id] = maxSequenceForPrefix(itemIds, category.codePrefix) + 1;
  }
  return seq;
}

export function peekNextItemCode(
  categories: Category[],
  seq: Record<string, number>,
  categoryId: string,
): string | undefined {
  const category = categories.find((entry) => entry.id === categoryId);
  if (!category) {
    return undefined;
  }
  return formatItemCode(category.codePrefix, seq[categoryId] ?? 1);
}

/**
 * Consumes the next never-reused code for a category. Skip values already
 * taken so a leftover dummy id cannot collide with a fresh assignment.
 */
export function allocateItemCode(
  categories: Category[],
  seq: Record<string, number>,
  takenIds: Iterable<string>,
  categoryId: string,
): Result<string> {
  const category = categories.find((entry) => entry.id === categoryId);
  if (!category) {
    return err({ code: 'VALIDATION', message: 'La categoría seleccionada no existe' });
  }

  const taken = new Set([...takenIds].map((id) => id.trim().toLocaleLowerCase()).filter(Boolean));
  let next = seq[category.id] ?? 1;
  let code = formatItemCode(category.codePrefix, next);
  while (taken.has(code.toLocaleLowerCase())) {
    next += 1;
    code = formatItemCode(category.codePrefix, next);
  }
  seq[category.id] = next + 1;
  return ok(code);
}
