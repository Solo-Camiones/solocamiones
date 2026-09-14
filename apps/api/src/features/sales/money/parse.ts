import { Prisma } from '@prisma/client';

import { AppError } from '../../../infrastructure/errors/app-error.js';

function isBlankString(value: string): boolean {
  return value.trim() === '';
}

function rejectInvalidMoney(field: string, value: unknown): never {
  throw AppError.validation(`Invalid ${field}: must be a decimal number`, { field, value });
}

/**
 * Parses money/quantity from Prisma Decimal or a decimal string.
 * JavaScript `number` is rejected so IEEE float never enters the engine.
 */
export function parseDecimal(value: unknown, field: string): Prisma.Decimal {
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
    rejectInvalidMoney(field, value);
  }

  if (Prisma.Decimal.isDecimal(value)) {
    if (!value.isFinite()) {
      rejectInvalidMoney(field, value);
    }

    return value;
  }

  if (typeof value !== 'string' || isBlankString(value)) {
    rejectInvalidMoney(field, value);
  }

  try {
    const parsed = new Prisma.Decimal(value.trim());
    if (!parsed.isFinite()) {
      rejectInvalidMoney(field, value);
    }

    return parsed;
  } catch {
    rejectInvalidMoney(field, value);
  }
}

export function parseNonNegativeDecimal(value: unknown, field: string): Prisma.Decimal {
  const parsed = parseDecimal(value, field);
  if (parsed.isNegative()) {
    throw AppError.validation(`${field} cannot be negative`, { field, value: parsed.toString() });
  }

  return parsed;
}

export function parsePositiveDecimal(value: unknown, field: string): Prisma.Decimal {
  const parsed = parseNonNegativeDecimal(value, field);
  if (parsed.isZero()) {
    throw AppError.validation(`${field} must be greater than 0`, { field, value: parsed.toString() });
  }

  return parsed;
}
