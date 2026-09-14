import { Prisma } from '@prisma/client';
import { z } from 'zod';

const DECIMAL_12_2_MAX = new Prisma.Decimal('9999999999.99');
const DECIMAL_12_2_MIN = new Prisma.Decimal('-9999999999.99');
const SIGNED_DECIMAL_12_2_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;

export const profitabilityInvoiceIdSchema = z.strictObject({
  invoiceId: z.uuid(),
});

export const recordManualGrossProfitSchema = z.strictObject({
  profitDop: z
    .string()
    .trim()
    .superRefine((value, context) => {
      if (!SIGNED_DECIMAL_12_2_PATTERN.test(value)) {
        context.addIssue({
          code: 'custom',
          message: 'Must be a decimal with at most 2 decimal places',
        });
        return;
      }

      const parsed = new Prisma.Decimal(value);
      if (parsed.greaterThan(DECIMAL_12_2_MAX) || parsed.lessThan(DECIMAL_12_2_MIN)) {
        context.addIssue({
          code: 'custom',
          message: 'Must be between -9999999999.99 and 9999999999.99',
        });
      }
    }),
});
