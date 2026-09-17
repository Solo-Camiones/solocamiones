import type { CustomerType } from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  CASH_CUSTOMER_CREDIT_FIELDS_FORBIDDEN_MESSAGE,
  CREDIT_CUSTOMER_REQUIRES_FISCAL_ID_MESSAGE,
  CREDIT_CUSTOMER_REQUIRES_LIMIT_MESSAGE,
  CREDIT_CUSTOMER_REQUIRES_TERM_MESSAGE,
  CREDIT_TERM_DAYS,
  GENERIC_CUSTOMER_LOCKED_MESSAGE,
} from './constants.js';
import { satisfiesFiscalIdentity } from './fiscal.js';

const ALLOWED_CREDIT_TERMS = new Set<number>(CREDIT_TERM_DAYS);

export type CustomerCreditProfile = {
  customerType: CustomerType;
  creditLimitDop: string | null;
  creditTermDays: number | null;
  rnc: string | null;
  isDefault: boolean;
};

type CreditFieldPatch = {
  customerType?: CustomerType;
  creditLimitDop?: string | null;
  creditTermDays?: number | null;
  rnc?: string | null;
};

export function resolveCreateCreditProfile(input: CreditFieldPatch): CustomerCreditProfile {
  return {
    customerType: input.customerType ?? 'CASH',
    creditLimitDop: input.creditLimitDop ?? null,
    creditTermDays: input.creditTermDays ?? null,
    rnc: input.rnc ?? null,
    isDefault: false,
  };
}

export function resolveUpdateCreditProfile(
  existing: CustomerCreditProfile,
  patch: CreditFieldPatch,
): CustomerCreditProfile {
  const customerType = patch.customerType ?? existing.customerType;
  const clearingToCash = patch.customerType === 'CASH';
  return {
    customerType,
    creditLimitDop:
      patch.creditLimitDop !== undefined
        ? patch.creditLimitDop
        : clearingToCash
          ? null
          : existing.creditLimitDop,
    creditTermDays:
      patch.creditTermDays !== undefined
        ? patch.creditTermDays
        : clearingToCash
          ? null
          : existing.creditTermDays,
    rnc: patch.rnc !== undefined ? patch.rnc : existing.rnc,
    isDefault: existing.isDefault,
  };
}

export function hasCreditWriteIntent(input: {
  customerType?: CustomerType;
  creditLimitDop?: string | null;
  creditTermDays?: number | null;
}): boolean {
  return (
    input.customerType === 'CREDIT' ||
    input.creditLimitDop != null ||
    input.creditTermDays != null
  );
}

export function assertCustomerCreditProfile(profile: CustomerCreditProfile): void {
  if (profile.isDefault && profile.customerType === 'CREDIT') {
    throw AppError.conflict(GENERIC_CUSTOMER_LOCKED_MESSAGE);
  }

  if (profile.customerType === 'CASH') {
    if (profile.creditLimitDop != null || profile.creditTermDays != null) {
      throw AppError.validation(CASH_CUSTOMER_CREDIT_FIELDS_FORBIDDEN_MESSAGE);
    }
    return;
  }

  if (!satisfiesFiscalIdentity({ isDefault: false, rnc: profile.rnc })) {
    throw AppError.validation(CREDIT_CUSTOMER_REQUIRES_FISCAL_ID_MESSAGE);
  }
  if (profile.creditLimitDop == null) {
    throw AppError.validation(CREDIT_CUSTOMER_REQUIRES_LIMIT_MESSAGE);
  }
  if (profile.creditTermDays == null || !ALLOWED_CREDIT_TERMS.has(profile.creditTermDays)) {
    throw AppError.validation(CREDIT_CUSTOMER_REQUIRES_TERM_MESSAGE);
  }
}
