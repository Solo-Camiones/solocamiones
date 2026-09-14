import { Prisma } from '@prisma/client';

import { MONEY_DECIMAL_PLACES } from './constants.js';
import { parseDecimal } from './parse.js';

/** Typical money rounding: two decimal places, half away from zero (HALF_UP). */
export function roundMoney(value: unknown): Prisma.Decimal {
  return parseDecimal(value, 'amount').toDecimalPlaces(
    MONEY_DECIMAL_PLACES,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}
