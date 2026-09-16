import type { CustomerType, Role } from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { hasCreditWriteIntent } from './credit-rules.js';

const MANAGER_ROLES: ReadonlySet<Role> = new Set(['ADMINISTRATOR', 'SELLER']);

export function assertCustomerManager(
  user: { active: boolean; role: Role; mustChangePassword: boolean } | null,
): void {
  if (!user?.active) throw AppError.unauthorized();
  if (user.mustChangePassword) {
    throw new AppError('FORBIDDEN', 'Password change required', {
      reason: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  if (!MANAGER_ROLES.has(user.role)) throw AppError.forbidden();
}

export function assertSellerMayWriteCreditFields(
  role: Role,
  input: {
    customerType?: CustomerType;
    creditLimitDop?: string | null;
    creditTermDays?: number | null;
  },
): void {
  if (role !== 'SELLER') return;
  if (hasCreditWriteIntent(input)) throw AppError.forbidden();
}

export function assertSellerMayUpdateCustomer(
  role: Role,
  existing: { customerType: CustomerType },
  patch: {
    customerType?: CustomerType;
    creditLimitDop?: string | null;
    creditTermDays?: number | null;
  },
): void {
  if (role !== 'SELLER') return;
  if (existing.customerType === 'CREDIT') throw AppError.forbidden();
  assertSellerMayWriteCreditFields(role, patch);
}
