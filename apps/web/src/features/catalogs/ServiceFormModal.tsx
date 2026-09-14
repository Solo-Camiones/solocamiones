import { useEffect, useState, type FormEvent } from 'react';

import type { SaveServiceInput } from '../../api/contracts/catalogs';
import type { Service } from '../../api/contracts/entities';
import { Button, Field, GuardedModal, Info, Input, isFormDirty } from '../../shared/ui';

export type ServiceFormModalProps = {
  open: boolean;
  service: Service | null;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: SaveServiceInput) => void;
};

type FormFields = {
  name: string;
  active: boolean;
};

const EMPTY_FIELDS: FormFields = {
  name: '',
  active: true,
};

export function ServiceFormModal({
  open,
  service,
  isSaving,
  error,
  onClose,
  onSubmit,
}: ServiceFormModalProps) {
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [baseline, setBaseline] = useState<FormFields>(EMPTY_FIELDS);
  const isEdit = service != null;
  const hasUnsavedChanges = isFormDirty(fields, baseline);

  useEffect(() => {
    if (!open) {
      return;
    }

    const next = service
      ? {
          name: service.name,
          active: service.active,
        }
      : EMPTY_FIELDS;
    setFields(next);
    setBaseline(next);
  }, [open, service]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (service) {
      if (!hasUnsavedChanges) return;
      onSubmit({
        id: service.id,
        ...(fields.name !== baseline.name ? { name: fields.name } : {}),
        ...(fields.active !== baseline.active ? { active: fields.active } : {}),
      });
      return;
    }

    onSubmit({ name: fields.name, active: fields.active });
  }

  return (
    <GuardedModal
      open={open}
      title={isEdit ? 'Editar servicio' : 'Nuevo servicio'}
      onClose={onClose}
      hasUnsavedChanges={hasUnsavedChanges}
      isBusy={isSaving}
    >
      {({ requestClose }) => (
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Info tone="error" title="No se pudo guardar">
            {error}
          </Info>
        )}
        <Field label="Nombre" htmlFor="service-name">
          <Input
            id="service-name"
            value={fields.name}
            onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))}
            required
            autoFocus
          />
        </Field>

        <label htmlFor="service-active" className="flex items-center gap-2 text-sm text-navy">
          <input
            id="service-active"
            type="checkbox"
            checked={fields.active}
            onChange={(event) =>
              setFields((current) => ({ ...current, active: event.target.checked }))
            }
          />
          Activo (visible en el punto de venta)
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={requestClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSaving || (isEdit && !hasUnsavedChanges)}>
            {isSaving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
      )}
    </GuardedModal>
  );
}
