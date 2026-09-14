import { Prisma } from '@prisma/client';

import { AppError } from '../../../infrastructure/errors/app-error.js';

import { DEFAULT_LINE_QUANTITY, INCLUDED_ITBIS_DIVISOR } from './constants.js';
import { parseNonNegativeDecimal } from './parse.js';
import { roundMoney } from './round.js';
import { INVOICE_LINE_TYPES, type InvoiceLineType, type LineMoney, type LineMoneyInput } from './types.js';

const TAXABLE_LINE_TYPES = new Set<InvoiceLineType>(['GENERIC', 'EXTERNAL', 'ITEM', 'QTY']);

export function isTaxableLineType(type: InvoiceLineType): boolean {
  return TAXABLE_LINE_TYPES.has(type);
}

function assertInvoiceLineType(type: string): asserts type is InvoiceLineType {
  if (!(INVOICE_LINE_TYPES as readonly string[]).includes(type)) {
    throw AppError.validation('Unknown invoice line type', { field: 'type', value: type });
  }
}

/**
 * Extracts included 18% ITBIS from a tax-inclusive line only when the invoice
 * is fiscal and the line kind is taxable merchandise. Service and delivery
 * never extract ITBIS. Non-fiscal invoices keep the entered price as the base.
 *
 * `itbis = round2(gross - base)` so each line still satisfies base + itbis = gross
 * after two-decimal rounding.
 */
export function calculateLineMoney(input: LineMoneyInput): LineMoney {
  assertInvoiceLineType(input.type);

  const unitPrice = parseNonNegativeDecimal(input.unitPrice, 'unitPrice');
  const quantity =
    input.quantity === undefined
      ? DEFAULT_LINE_QUANTITY
      : parseNonNegativeDecimal(input.quantity, 'quantity');

  const gross = roundMoney(unitPrice.times(quantity));
  const taxable = isTaxableLineType(input.type);
  const extractIncludedItbis = input.fiscal === true && taxable;

  if (!extractIncludedItbis) {
    return {
      gross,
      base: gross,
      itbis: new Prisma.Decimal(0),
      taxable,
    };
  }

  const base = roundMoney(gross.div(INCLUDED_ITBIS_DIVISOR));
  const itbis = roundMoney(gross.minus(base));

  return { gross, base, itbis, taxable };
}
