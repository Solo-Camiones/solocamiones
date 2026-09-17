import { useEffect, useState, type FormEvent } from 'react';

import type { UpdateOwnProfileInput } from '../../api/contracts/profile';
import type { AuthUser } from '../auth/auth-context';
import { roleLabel } from '../../shared/auth/policies';
import { formatDominicanPhone } from '../../shared/domain/phone';
import { Button, Card, Field, Info, Input } from '../../shared/ui';

type ProfileFormProps = {
  user: AuthUser;
  isSaving: boolean;
  error: string | null;
  onSubmit: (input: UpdateOwnProfileInput) => void;
};

type FormFields = {
  name: string;
  phone: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

function fieldsFromUser(user: AuthUser): FormFields {
  return {
    name: user.name,
    phone: formatDominicanPhone(user.phone),
    email: user.email ?? '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };
}

export function ProfileForm({ user, isSaving, error, onSubmit }: ProfileFormProps) {
  const [fields, setFields] = useState<FormFields>(() => fieldsFromUser(user));

  useEffect(() => {
    setFields(fieldsFromUser(user));
  }, [user]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      name: fields.name,
      phone: fields.phone,
      email: fields.email,
      currentPassword: fields.currentPassword || undefined,
      newPassword: fields.newPassword || undefined,
      confirmPassword: fields.confirmPassword || undefined,
    });
  }

  return (
    <Card padding="lg" className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Info tone="error" title="No se pudo guardar">
            {error}
          </Info>
        )}

        <Field
          label="Usuario"
          htmlFor="profile-username"
          hint="El identificador de acceso no se puede cambiar aquí"
        >
          <Input id="profile-username" value={user.username} disabled readOnly />
        </Field>

        <Field label="Rol" htmlFor="profile-role">
          <Input id="profile-role" value={roleLabel(user.role)} disabled readOnly />
        </Field>

        <Field label="Nombre" htmlFor="profile-name">
          <Input
            id="profile-name"
            value={fields.name}
            onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))}
            required
            autoComplete="name"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono" htmlFor="profile-phone" hint="Opcional">
            <Input
              id="profile-phone"
              inputMode="numeric"
              value={fields.phone}
              onChange={(event) =>
                setFields((current) => ({
                  ...current,
                  phone: formatDominicanPhone(event.target.value),
                }))
              }
              autoComplete="tel"
              placeholder="809-555-0100"
            />
          </Field>
          <Field label="Correo" htmlFor="profile-email" hint="Opcional">
            <Input
              id="profile-email"
              type="email"
              value={fields.email}
              onChange={(event) =>
                setFields((current) => ({ ...current, email: event.target.value }))
              }
              autoComplete="email"
            />
          </Field>
        </div>

        <div className="border-t border-navy-100 pt-4">
          <p className="mb-3 text-sm font-medium text-navy">Cambiar contraseña</p>
          <p className="mb-4 text-xs text-navy-400">
            {user.mustChangePassword
              ? 'Debe cambiar su contraseña inicial o temporal para continuar. Mínimo 6 caracteres y diferente de la actual.'
              : 'Deje estos campos vacíos si no desea cambiar la contraseña. Mínimo 6 caracteres.'}
          </p>
          <div className="space-y-4">
            <Field label="Contraseña actual" htmlFor="profile-current-password">
              <Input
                id="profile-current-password"
                type="password"
                value={fields.currentPassword}
                onChange={(event) =>
                  setFields((current) => ({ ...current, currentPassword: event.target.value }))
                }
                autoComplete="current-password"
              />
            </Field>
            <Field label="Nueva contraseña" htmlFor="profile-new-password">
              <Input
                id="profile-new-password"
                type="password"
                value={fields.newPassword}
                onChange={(event) =>
                  setFields((current) => ({ ...current, newPassword: event.target.value }))
                }
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirmar nueva contraseña" htmlFor="profile-confirm-password">
              <Input
                id="profile-confirm-password"
                type="password"
                value={fields.confirmPassword}
                onChange={(event) =>
                  setFields((current) => ({ ...current, confirmPassword: event.target.value }))
                }
                autoComplete="new-password"
              />
            </Field>
          </div>
        </div>

        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </form>
    </Card>
  );
}
