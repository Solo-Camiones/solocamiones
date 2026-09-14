import { Prisma } from '@prisma/client';

import type { InvoiceMoneyTotals, RoundedLineMoney } from './types.js';

/**
 * Invoice totals are the sum of already-rounded line values.
 * Do not apply a second rounding policy to a combined unrounded gross.
 */
export function sumInvoiceMoney(lines: readonly RoundedLineMoney[]): InvoiceMoneyTotals {
  return lines.reduce<InvoiceMoneyTotals>(
    (totals, line) => ({
      gross: totals.gross.plus(line.gross),
      base: totals.base.plus(line.base),
      itbis: totals.itbis.plus(line.itbis),
    }),
    {
      gross: new Prisma.Decimal(0),
      base: new Prisma.Decimal(0),
      itbis: new Prisma.Decimal(0),
    },
  );
}
