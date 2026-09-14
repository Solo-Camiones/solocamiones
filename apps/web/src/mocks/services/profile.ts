import type { UpdateOwnProfileInput } from '../../api/contracts/profile';
import type { User } from '../../api/contracts/entities';
import { err, ok, type Result } from '../../shared/auth/types';
import { isValidEmail } from './email';

export const MIN_PROFILE_PASSWORD_LENGTH = 6;

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Validates self-service profile edits against the session user.
 * Copies only name, phone, email, and optional password — never username, role, or active.
 */
export function prepareProfileUpdate(user: User, input: UpdateOwnProfileInput): Result<User> {
  const name = input.name.trim();
  if (!name) {
    return err({ code: 'VALIDATION', message: 'El nombre es obligatorio' });
  }

  const email = optionalText(input.email);
  if (email && !isValidEmail(email)) {
    return err({ code: 'VALIDATION', message: 'El correo no es válido' });
  }

  const newPassword = optionalText(input.newPassword);
  let password = user.password;

  if (newPassword) {
    if (newPassword.length < MIN_PROFILE_PASSWORD_LENGTH) {
      return err({
        code: 'VALIDATION',
        message: `La nueva contraseña debe tener al menos ${MIN_PROFILE_PASSWORD_LENGTH} caracteres`,
      });
    }

    if (input.currentPassword !== user.password) {
      return err({ code: 'VALIDATION', message: 'La contraseña actual es incorrecta' });
    }

    if (input.confirmPassword !== newPassword) {
      return err({ code: 'VALIDATION', message: 'La confirmación no coincide' });
    }

    password = newPassword;
  }

  return ok({
    id: user.id,
    username: user.username,
    role: user.role,
    active: user.active,
    name,
    phone: optionalText(input.phone),
    email,
    password,
  });
}
