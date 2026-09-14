import type { ManagedUser, SaveUserInput } from '../../api/contracts/users';
import type { Role, User } from '../../api/contracts/entities';
import { err, ok, type Result } from '../../shared/auth/types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const ROLES: Role[] = ['ADMINISTRATOR', 'SELLER', 'MECHANIC'];

export const INITIAL_USER_PASSWORD = 'solocamiones';

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function toManagedUser(user: User): ManagedUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword ?? false,
    phone: user.phone,
    email: user.email,
  };
}

export function sortManagedUsers(users: ManagedUser[]): ManagedUser[] {
  return [...users].sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }
    return left.name.localeCompare(right.name, 'es');
  });
}

export function nextUserId(users: User[], username: string): string {
  const slug =
    username
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 16) || 'USER';
  const base = `U-${slug}`;
  const used = users.map((user) => user.id);
  if (!used.includes(base)) {
    return base;
  }

  let index = 2;
  let candidate = `${base}-${index}`;
  while (used.includes(candidate)) {
    index += 1;
    candidate = `${base}-${index}`;
  }
  return candidate;
}

function activeAdministratorCount(users: User[], excludeId?: string): number {
  return users.filter(
    (user) => user.role === 'ADMINISTRATOR' && user.active && user.id !== excludeId,
  ).length;
}

function wouldLeaveNoActiveAdmin(
  users: User[],
  existing: User | undefined,
  nextRole: Role,
  nextActive: boolean,
): boolean {
  if (!existing) {
    return false;
  }

  const currentlyCounts = existing.role === 'ADMINISTRATOR' && existing.active;
  const willCount = nextRole === 'ADMINISTRATOR' && nextActive;
  if (!currentlyCounts || willCount) {
    return false;
  }

  return activeAdministratorCount(users, existing.id) === 0;
}

/**
 * Validates administrator user-management commands (AUTH-003 / AUTH-004).
 * The mock mirrors the server-assigned initial credential; it never accepts one from the UI.
 */
export function prepareUserSave(
  users: User[],
  input: SaveUserInput,
  actorId: string,
): Result<User> {
  const name = optionalText(input.name);
  if (!name) {
    return err({ code: 'VALIDATION', message: 'El nombre es obligatorio' });
  }

  const username = input.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    return err({
      code: 'VALIDATION',
      message: 'El usuario debe tener 2–32 caracteres (letras, números, _ o -)',
    });
  }

  if (!ROLES.includes(input.role)) {
    return err({ code: 'VALIDATION', message: 'El rol no es válido' });
  }

  const email = optionalText(input.email);
  if (email && !EMAIL_PATTERN.test(email)) {
    return err({ code: 'VALIDATION', message: 'El correo no es válido' });
  }

  const existing = input.id ? users.find((user) => user.id === input.id) : undefined;
  if (input.id && !existing) {
    return err({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
  }

  const usernameTaken = users.some(
    (user) => user.username.toLowerCase() === username && user.id !== input.id,
  );
  if (usernameTaken) {
    return err({ code: 'CONFLICT', message: 'El nombre de usuario ya existe' });
  }

  if (existing && existing.id === actorId && input.active === false) {
    return err({ code: 'VALIDATION', message: 'No puede desactivar su propia cuenta' });
  }

  if (wouldLeaveNoActiveAdmin(users, existing, input.role, input.active)) {
    return err({
      code: 'VALIDATION',
      message: 'Debe quedar al menos un administrador activo',
    });
  }

  return ok({
    id: existing?.id ?? nextUserId(users, username),
    name,
    username,
    password: existing?.password ?? INITIAL_USER_PASSWORD,
    mustChangePassword: existing?.mustChangePassword ?? true,
    role: input.role,
    active: input.active,
    phone: optionalText(input.phone),
    email,
  });
}
