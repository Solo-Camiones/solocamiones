import { Prisma } from '@prisma/client';

import { AppError } from '../../../infrastructure/errors/app-error.js';

import { DEFAULT_LINE_QUANTITY, ITBIS_RATE } from './constants.js';
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
 * Tax-exclusive line money. The typed unit price is the base. When `applyItbis`
 * is on, taxable merchandise adds 18% per already-rounded line. Service and
 * delivery stay non-taxable. Fiscal emission is not an input here.
 */
export function calculateLineMoney(input: LineMoneyInput): LineMoney {
  assertInvoiceLineType(input.type);

  const unitPrice = parseNonNegativeDecimal(input.unitPrice, 'unitPrice');
  const quantity =
    input.quantity === undefined
      ? DEFAULT_LINE_QUANTITY
      : parseNonNegativeDecimal(input.quantity, 'quantity');

  const base = roundMoney(unitPrice.times(quantity));
  const taxable = isTaxableLineType(input.type);
  const addItbis = input.applyItbis === true && taxable;

  if (!addItbis) {
    return {
      gross: base,
      base,
      itbis: new Prisma.Decimal(0),
      taxable,
    };
  }

  const itbis = roundMoney(base.times(ITBIS_RATE));
  return { gross: base.plus(itbis), base, itbis, taxable };
}
