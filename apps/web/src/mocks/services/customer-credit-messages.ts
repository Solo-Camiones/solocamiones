/** English messages aligned with `apps/api/src/features/customers/constants.ts`. */
export const INSUFFICIENT_PERMISSIONS_MESSAGE = 'Insufficient permissions';

export const CREDIT_CUSTOMER_DOWNGRADE_FORBIDDEN_MESSAGE =
  'Customer cannot change to CASH while a completed invoice has an outstanding balance';

export const CREDIT_FISCAL_REQUIRED_MESSAGE =
  'CREDIT customers require a valid RNC or Cédula';

export const CREDIT_LIMIT_REQUIRED_MESSAGE =
  'CREDIT customers require a positive credit limit in DOP';

export const CREDIT_TERM_REQUIRED_MESSAGE =
  'CREDIT customers require a credit term of 30, 45, 60, 90, or 120 days';

export const CREDIT_LIMIT_FORMAT_MESSAGE =
  'Must be a non-negative decimal with at most 2 decimal places';

export const CASH_CREDIT_FIELDS_FORBIDDEN_MESSAGE =
  'CASH customers cannot have a credit limit or term';
