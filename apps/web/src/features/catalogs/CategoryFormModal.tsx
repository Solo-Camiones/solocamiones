import { useEffect, useState, type FormEvent } from 'react';

import type { SaveCategoryInput } from '../../api/contracts/catalogs';
import type { Category } from '../../api/contracts/entities';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { Button, Field, GuardedModal, Info, Input, Textarea, isFormDirty } from '../../shared/ui';
import {
  CategoryAttributeDefinitionsEditor,
  definitionsFromDrafts,
  draftsFromDefinitions,
  type AttributeDraft,
} from './CategoryAttributeDefinitionsEditor';

export type CategoryFormModalProps = {
  open: boolean;
  category: Category | null;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: SaveCategoryInput) => void;
};

type FormFields = {
  name: string;
  codePrefix: string;
  isAssembly: boolean;
  expectedComponentsText: string;
  attributeDrafts: AttributeDraft[];
};

const EMPTY_FIELDS: FormFields = {
  name: '',
  codePrefix: '',
  isAssembly: false,
  expectedComponentsText: '',
  attributeDrafts: [],
};

export function CategoryFormModal({
  open,
  category,
  isSaving,
  error,
  onClose,
  onSubmit,
}: CategoryFormModalProps) {
  const { hierarchy } = useAppCapabilities();
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [baseline, setBaseline] = useState<FormFields>(EMPTY_FIELDS);
  const isEdit = category != null;

  useEffect(() => {
    if (!open) {
      return;
    }

    const next: FormFields = category
      ? {
          name: category.name,
          codePrefix: category.codePrefix,
          isAssembly: category.isAssembly,
          expectedComponentsText: (category.expectedComponents ?? []).join('\n'),
          attributeDrafts: draftsFromDefinitions(category.attributes),
        }
      : EMPTY_FIELDS;
    setFields(next);
    setBaseline(next);
  }, [open, category]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      id: category?.id,
      name: fields.name,
      codePrefix: fields.codePrefix,
      isAssembly: hierarchy ? fields.isAssembly : false,
      expectedComponents:
        hierarchy && fields.isAssembly ? fields.expectedComponentsText.split('\n') : undefined,
      attributes: definitionsFromDrafts(fields.attributeDrafts),
    });
  }

  return (
    <GuardedModal
      open={open}
      title={isEdit ? 'Editar categoría' : 'Nueva categoría'}
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
          <Field label="Nombre" htmlFor="category-name">
            <Input
              id="category-name"
              value={fields.name}
              onChange={(event) =>
                setFields((current) => ({ ...current, name: event.target.value }))
              }
              required
              autoFocus
            />
          </Field>
          <Field
            label="Prefijo de código"
            htmlFor="category-prefix"
            hint={
              isEdit
                ? 'No se cambia: las piezas ya registradas conservan su código.'
                : 'Ejemplo MOT. Las piezas nuevas se numeran MOT-001, MOT-002…'
            }
          >
            <Input
              id="category-prefix"
              value={fields.codePrefix}
              onChange={(event) =>
                setFields((current) => ({
                  ...current,
                  codePrefix: event.target.value.toUpperCase(),
                }))
              }
              required={!isEdit}
              disabled={isEdit}
              maxLength={8}
            />
          </Field>

          {hierarchy && (
            <label
              htmlFor="category-assembly"
              className="flex items-center gap-2 text-sm text-navy"
            >
              <input
                id="category-assembly"
                type="checkbox"
                checked={fields.isAssembly}
                onChange={(event) =>
                  setFields((current) => ({ ...current, isAssembly: event.target.checked }))
                }
              />
              Es ensamblaje (requiere componentes esperados)
            </label>
          )}

          {hierarchy && fields.isAssembly && (
            <Field
              label="Componentes esperados"
              htmlFor="category-expected"
              hint="Un nombre por línea. Son plantillas de checklist, no inventario."
            >
              <Textarea
                id="category-expected"
                rows={5}
                value={fields.expectedComponentsText}
                onChange={(event) =>
                  setFields((current) => ({
                    ...current,
                    expectedComponentsText: event.target.value,
                  }))
                }
              />
            </Field>
          )}

          <CategoryAttributeDefinitionsEditor
            drafts={fields.attributeDrafts}
            onChange={(attributeDrafts) =>
              setFields((current) => ({ ...current, attributeDrafts }))
            }
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={requestClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      )}
    </GuardedModal>
  );
}
