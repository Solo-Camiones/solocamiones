import type { User } from '../../api/contracts/entities';
import type { PolicyAction } from '../../shared/auth/policies';
import { can } from '../../shared/auth/policies';
import { err, ok, type Result } from '../../shared/auth/types';
import { getSession } from '../session';
import { getMockState } from '../state';

/**
 * Session lookup shared by single-action and any-of checks.
 * Catalog reads are allowed for sellers (inventory.view) and admins (catalogs.manage).
 */
function resolveSessionUser(): Result<User> {
  const session = getSession();

  if (!session) {
    return err({ code: 'UNAUTHORIZED', message: 'Debe iniciar sesión para realizar esta acción' });
  }

  const user = getMockState().users.find((entry) => entry.id === session.userId);

  if (!user) {
    return err({ code: 'UNAUTHORIZED', message: 'Sesión inválida' });
  }

  if (!user.active) {
    return err({ code: 'FORBIDDEN', message: 'Esta cuenta está desactivada' });
  }

  return ok(user);
}

/**
 * Validates the current mock session against policies before a mutation.
 * Route guards are UX-only; services must call this (or equivalent) server-side in production.
 */
export function requirePermission(action: PolicyAction): Result<User> {
  const sessionUser = resolveSessionUser();
  if (!sessionUser.ok) {
    return sessionUser;
  }

  if (!can(sessionUser.value, action)) {
    return err({ code: 'FORBIDDEN', message: 'No tiene permiso para realizar esta acción' });
  }

  return sessionUser;
}

export function requireAdministrator(): Result<User> {
  const sessionUser = resolveSessionUser();
  if (!sessionUser.ok) {
    return sessionUser;
  }

  if (sessionUser.value.role !== 'ADMINISTRATOR') {
    return err({ code: 'FORBIDDEN', message: 'No tiene permiso para realizar esta acción' });
  }

  return sessionUser;
}

export function requireAnyPermission(actions: PolicyAction[]): Result<User> {
  const sessionUser = resolveSessionUser();
  if (!sessionUser.ok) {
    return sessionUser;
  }

  if (!actions.some((action) => can(sessionUser.value, action))) {
    return err({ code: 'FORBIDDEN', message: 'No tiene permiso para realizar esta acción' });
  }

  return sessionUser;
}
