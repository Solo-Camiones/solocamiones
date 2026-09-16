import { Prisma } from '@prisma/client';

/** Fixed ITBIS rate added to the tax-exclusive base. Not Administrator-configurable. */
export const ITBIS_RATE = new Prisma.Decimal('0.18');

export const MONEY_DECIMAL_PLACES = 2;

export const DEFAULT_LINE_QUANTITY = new Prisma.Decimal(1);
