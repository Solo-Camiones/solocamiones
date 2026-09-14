import { Prisma } from '@prisma/client';

/** Fixed included ITBIS rate for taxable merchandise. Not Administrator-configurable. */
export const ITBIS_INCLUDED_RATE = new Prisma.Decimal('0.18');

/** 1 + included rate: extract base from a tax-inclusive gross, never add 18% on top. */
export const INCLUDED_ITBIS_DIVISOR = new Prisma.Decimal(1).plus(ITBIS_INCLUDED_RATE);

export const MONEY_DECIMAL_PLACES = 2;

export const DEFAULT_LINE_QUANTITY = new Prisma.Decimal(1);
