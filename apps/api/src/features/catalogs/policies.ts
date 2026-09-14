import type { Role } from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { assertAdministrator } from '../users/policies.js';

const READER_ROLES: ReadonlySet<Role> = new Set(['ADMINISTRATOR', 'SELLER']);

export { assertAdministrator as assertCatalogAdministrator };

export function assertCatalogReader(
  user: { active: boolean; role: Role; mustChangePassword: boolean } | null,
): void {
  if (!user?.active) throw AppError.unauthorized();
  if (user.mustChangePassword) {
    throw new AppError('FORBIDDEN', 'Password change required', {
      reason: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  if (!READER_ROLES.has(user.role)) throw AppError.forbidden();
}
