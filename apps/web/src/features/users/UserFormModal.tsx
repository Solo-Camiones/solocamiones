import { useEffect, useState, type FormEvent } from 'react';

import type { Role } from '../../api/contracts/entities';
import type { ManagedUser, SaveUserInput } from '../../api/contracts/users';
import { roleLabel } from '../../shared/auth/policies';
import { Button, Field, GuardedModal, Info, Input, ReviewSummary, Select, isFormDirty } from '../../shared/ui';

export type UserFormModalProps = {
  open: boolean;
  user: ManagedUser | null;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: SaveUserInput) => void;
};

const ROLES: Role[] = ['ADMINISTRATOR', 'SELLER', 'MECHANIC'];

type FormFields = {
  name: string;
  username: string;
  role: Role;
  active: boolean;
  phone: string;
  email: string;
};

const EMPTY_FIELDS: FormFields = {
  name: '',
  username: '',
  role: 'SELLER',
  active: true,
  phone: '',
  email: '',
};

export function UserFormModal({
  open,
  user,
  isSaving,
  error,
  onClose,
  onSubmit,
}: UserFormModalProps) {
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [baseline, setBaseline] = useState<FormFields>(EMPTY_FIELDS);
  const [step, setStep] = useState<'form' | 'review'>('form');
  const isEdit = user != null;

  useEffect(() => {
    if (!open) {
      return;
    }

    const next = user
      ? {
          name: user.name,
          username: user.username,
          role: user.role,
          active: user.active,
          phone: user.phone ?? '',
          email: user.email ?? '',
        }
      : EMPTY_FIELDS;
    setFields(next);
    setBaseline(next);
    setStep('form');
  }, [open, user]);

  function savePayload(): SaveUserInput {
    return {
      ...(user ? { id: user.id, active: fields.active } : { active: true }),
      name: fields.name,
      username: fields.username,
      role: fields.role,
      phone: fields.phone,
      email: fields.email,
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isEdit && step === 'form') {
      if (!event.currentTarget.reportValidity()) {
        return;
      }
      setStep('review');
      return;
    }
    onSubmit(savePayload());
  }

  return (
    <GuardedModal
      open={open}
      title={isEdit ? 'Editar usuario' : 'Nuevo usuario'}
      onClose={onClose}
      hasUnsavedChanges={isFormDirty(fields, baseline)}
      isBusy={isSaving}
    >
      {({ requestClose }) => (
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Info tone="error" title="No se pudo guardar">
            {error}
          </Info>
        )}
        {step === 'review' && !isEdit ? (
          <div className="space-y-4">
            <p className="text-sm font-medium text-navy">Revisa los datos antes de crear el usuario.</p>
            <ReviewSummary
              rows={[
                { label: 'Nombre', value: fields.name },
                { label: 'Usuario', value: fields.username },
                { label: 'Rol', value: roleLabel(fields.role) },
                { label: 'Teléfono', value: fields.phone },
                { label: 'Correo', value: fields.email },
              ]}
            />
            <Info title="Contraseña inicial">
              El sistema asignará la contraseña inicial al crear la cuenta y se mostrará una sola
              vez. No se pide ni se muestra en este resumen.
            </Info>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep('form')}
                disabled={isSaving}
              >
                Volver a editar
              </Button>
              <Button type="button" disabled={isSaving} onClick={() => onSubmit(savePayload())}>
                {isSaving ? 'Guardando…' : 'Confirmar creación'}
              </Button>
            </div>
          </div>
        ) : (
          <>
        <Field label="Nombre" htmlFor="user-name">
          <Input
            id="user-name"
            value={fields.name}
            onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))}
            required
            autoFocus
            autoComplete="name"
          />
        </Field>
        <Field label="Usuario" htmlFor="user-username" hint="Identificador de acceso, único">
          <Input
            id="user-username"
            value={fields.username}
            onChange={(event) =>
              setFields((current) => ({ ...current, username: event.target.value }))
            }
            required
            autoComplete="username"
          />
        </Field>
        {!isEdit && (
          <Info title="Contraseña inicial">
            El sistema asignará la contraseña inicial y se mostrará una sola vez después de crear
            la cuenta. La persona deberá cambiarla desde Mi perfil antes de poder operar.
          </Info>
        )}
        <Field label="Rol" htmlFor="user-role">
          <Select
            id="user-role"
            value={fields.role}
            onChange={(event) =>
              setFields((current) => ({ ...current, role: event.target.value as Role }))
            }
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Teléfono" htmlFor="user-phone">
          <Input
            id="user-phone"
            value={fields.phone}
            onChange={(event) =>
              setFields((current) => ({ ...current, phone: event.target.value }))
            }
            autoComplete="tel"
          />
        </Field>
        <Field label="Correo" htmlFor="user-email">
          <Input
            id="user-email"
            type="email"
            value={fields.email}
            onChange={(event) =>
              setFields((current) => ({ ...current, email: event.target.value }))
            }
            autoComplete="email"
          />
        </Field>
        {isEdit && (
          <label htmlFor="user-active" className="flex items-center gap-2 text-sm text-navy">
            <input
              id="user-active"
              type="checkbox"
              checked={fields.active}
              onChange={(event) =>
                setFields((current) => ({ ...current, active: event.target.checked }))
              }
            />
            Cuenta activa
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={requestClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear usuario'}
          </Button>
        </div>
          </>
        )}
      </form>
      )}
    </GuardedModal>
  );
}
