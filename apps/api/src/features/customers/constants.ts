import { Prisma } from '@prisma/client';

export const GENERIC_CASH_CUSTOMER_NAME = 'Cliente contado';
export const RNC_DIGIT_COUNT = 9;
export const CEDULA_DIGIT_COUNT = 11;
export const GENERIC_CUSTOMER_LOCKED_MESSAGE = 'Cliente contado cannot be edited';
export const FISCAL_IDENTIFIER_CONFLICT_MESSAGE =
  'A customer with this fiscal identifier already exists';
export const CONTACT_PHONE_OR_EMAIL_MESSAGE = 'Each contact must include a phone or email';
export const CONTACT_PRIMARY_LIMIT_MESSAGE = 'Only one contact can be primary';
export const FISCAL_IDENTIFIER_FORMAT_MESSAGE =
  'Fiscal identifier must be a 9-digit RNC or 11-digit Cédula';

export const CUSTOMER_TYPES = ['CASH', 'CREDIT'] as const;
export const CREDIT_TERM_DAYS = [30, 45, 60, 90, 120] as const;

export const DECIMAL_12_2_MAX = new Prisma.Decimal('9999999999.99');
export const DECIMAL_12_2_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export const CASH_CUSTOMER_CREDIT_FIELDS_FORBIDDEN_MESSAGE =
  'CASH customers cannot have a credit limit or term';
export const CREDIT_CUSTOMER_REQUIRES_FISCAL_ID_MESSAGE =
  'CREDIT customers require a valid RNC or Cédula';
export const CREDIT_CUSTOMER_REQUIRES_LIMIT_MESSAGE =
  'CREDIT customers require a positive credit limit in DOP';
export const CREDIT_CUSTOMER_REQUIRES_TERM_MESSAGE =
  'CREDIT customers require a credit term of 30, 45, 60, 90, or 120 days';
export const CREDIT_TO_CASH_OPEN_BALANCE_MESSAGE =
  'Customer cannot change to CASH while a completed invoice has an outstanding balance';
