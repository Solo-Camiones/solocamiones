import { Prisma } from '@prisma/client';

import { AppError } from '../../../infrastructure/errors/app-error.js';

import { parseNonNegativeDecimal } from './parse.js';
import { roundMoney } from './round.js';
import { sumInvoiceMoney } from './totals.js';
import type { MoneyInput, RoundedLineMoney } from './types.js';

const MAX_DISCOUNT_PERCENT = new Prisma.Decimal(100);

export type DiscountableLineMoney = RoundedLineMoney & {
  taxable: boolean;
};

export type DiscountedInvoiceMoney = {
  /** Amount subtracted from the sum of all line bases. */
  discount: Prisma.Decimal;
  /** Economic base after discount: all line bases − discount. */
  base: Prisma.Decimal;
  /** Pre-discount ITBIS (sum of line ITBIS; discount does not reduce tax). */
  itbis: Prisma.Decimal;
  gross: Prisma.Decimal;
  /** Pre-discount sum of taxable line bases (ITBIS base). */
  taxableBase: Prisma.Decimal;
  /** Pre-discount sum of non-taxable line bases. */
  exemptBase: Prisma.Decimal;
};

function parseDiscountPercent(value: MoneyInput): Prisma.Decimal {
  const percent = parseNonNegativeDecimal(value, 'discountPercent');
  if (percent.greaterThan(MAX_DISCOUNT_PERCENT)) {
    throw AppError.validation('discountPercent cannot exceed 100', {
      field: 'discountPercent',
      value: percent.toString(),
    });
  }
  return percent;
}

/**
 * Invoice-level commercial discount on the sum of all line bases.
 *
 * ITBIS stays the SALE-010 sum of already-rounded per-line ITBIS (taxable
 * bases before discount). When the discount amount is zero, header totals
 * match that per-line sum. When a discount applies, header base is
 * (all bases − discount) and gross is base + pre-discount ITBIS. Line money
 * is not rewritten.
 */
export function applyInvoiceDiscount(input: {
  lines: readonly DiscountableLineMoney[];
  discountPercent: MoneyInput;
  /** Kept for callers; line ITBIS already reflects applyItbis. */
  applyItbis: boolean;
}): DiscountedInvoiceMoney {
  const percent = parseDiscountPercent(input.discountPercent);
  const summed = sumInvoiceMoney(input.lines);

  let taxableBase = new Prisma.Decimal(0);
  let exemptBase = new Prisma.Decimal(0);
  for (const line of input.lines) {
    if (line.taxable) {
      taxableBase = taxableBase.plus(line.base);
    } else {
      exemptBase = exemptBase.plus(line.base);
    }
  }

  // Discount base is every line (merchandise + service/delivery), not only taxable.
  const discount = roundMoney(summed.base.times(percent).div(100));
  // ITBIS stays pre-discount (sum of line ITBIS). applyItbis is the safety gate.
  const itbis = input.applyItbis ? summed.itbis : new Prisma.Decimal(0);

  if (discount.isZero()) {
    return {
      discount,
      base: summed.base,
      itbis,
      gross: summed.base.plus(itbis),
      taxableBase,
      exemptBase,
    };
  }

  const base = summed.base.minus(discount);
  const gross = base.plus(itbis);

  return {
    discount,
    base,
    itbis,
    gross,
    taxableBase,
    exemptBase,
  };
}
