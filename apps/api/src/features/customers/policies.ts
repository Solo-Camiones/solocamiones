import type { Role } from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';

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
