import type {
  CategoryAttributeDefinition,
  CategoryAttributeType,
} from '../../api/contracts/entities';
import {
  CATEGORY_ATTRIBUTE_TYPES,
  categoryAttributeTypeLabel,
  MAX_CATEGORY_ATTRIBUTES,
  suggestAttributeKey,
} from '../../shared/domain/category-attributes';
import { Button, Field, Input, Select, Textarea } from '../../shared/ui';

export type AttributeDraft = {
  key: string;
  /** True for attributes already persisted; renaming the label must not change the storage key. */
  keyLocked: boolean;
  label: string;
  type: CategoryAttributeType;
  required: boolean;
  optionsText: string;
};

export function draftsFromDefinitions(
  definitions: CategoryAttributeDefinition[] | undefined,
): AttributeDraft[] {
  return (definitions ?? []).map((definition) => ({
    key: definition.key,
    keyLocked: true,
    label: definition.label,
    type: definition.type,
    required: Boolean(definition.required),
    optionsText: (definition.options ?? []).join('\n'),
  }));
}

/** New attributes take the key from the label; saved ones keep the stored key. */
export function resolveDraftAttributeKey(draft: AttributeDraft): string {
  if (draft.keyLocked) {
    return draft.key.trim().toLowerCase();
  }
  return suggestAttributeKey(draft.label);
}

export function definitionsFromDrafts(drafts: AttributeDraft[]): CategoryAttributeDefinition[] {
  return drafts.map((draft) => ({
    key: resolveDraftAttributeKey(draft),
    label: draft.label.trim(),
    type: draft.type,
    required: draft.required || undefined,
    options:
      draft.type === 'select'
        ? draft.optionsText
            .split('\n')
            .map((option) => option.trim())
            .filter(Boolean)
        : undefined,
  }));
}

const EMPTY_DRAFT: AttributeDraft = {
  key: '',
  keyLocked: false,
  label: '',
  type: 'text',
  required: false,
  optionsText: '',
};

type CategoryAttributeDefinitionsEditorProps = {
  drafts: AttributeDraft[];
  onChange: (drafts: AttributeDraft[]) => void;
};

export function CategoryAttributeDefinitionsEditor({
  drafts,
  onChange,
}: CategoryAttributeDefinitionsEditorProps) {
  const patch = (index: number, next: Partial<AttributeDraft>) => {
    onChange(drafts.map((draft, current) => (current === index ? { ...draft, ...next } : draft)));
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-navy">Atributos de la categoría</p>
        <p className="text-xs text-navy-400">
          Campos que aparecen al registrar una pieza. El identificador interno se genera desde la
          etiqueta y no cambia después de guardar. Máximo {MAX_CATEGORY_ATTRIBUTES}.
        </p>
      </div>

      {drafts.map((draft, index) => {
        const prefix = `category-attr-${index}`;
        return (
          <div key={prefix} className="space-y-3 rounded-lg border border-navy-100 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Etiqueta" htmlFor={`${prefix}-label`}>
                <Input
                  id={`${prefix}-label`}
                  value={draft.label}
                  onChange={(event) => {
                    const label = event.target.value;
                    patch(index, {
                      label,
                      key: draft.keyLocked ? draft.key : suggestAttributeKey(label),
                    });
                  }}
                />
              </Field>
              <Field label="Tipo" htmlFor={`${prefix}-type`}>
                <Select
                  id={`${prefix}-type`}
                  value={draft.type}
                  onChange={(event) =>
                    patch(index, { type: event.target.value as CategoryAttributeType })
                  }
                >
                  {CATEGORY_ATTRIBUTE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {categoryAttributeTypeLabel(type)}
                    </option>
                  ))}
                </Select>
              </Field>
              <label
                htmlFor={`${prefix}-required`}
                className="flex items-center gap-2 text-sm text-navy"
              >
                <input
                  id={`${prefix}-required`}
                  type="checkbox"
                  checked={draft.required}
                  onChange={(event) => patch(index, { required: event.target.checked })}
                />
                Obligatorio al registrar
              </label>
            </div>
            {draft.type === 'select' && (
              <Field
                label="Opciones"
                htmlFor={`${prefix}-options`}
                hint="Una opción por línea. El operador elige; no escribe texto libre."
              >
                <Textarea
                  id={`${prefix}-options`}
                  rows={3}
                  value={draft.optionsText}
                  onChange={(event) => patch(index, { optionsText: event.target.value })}
                />
              </Field>
            )}
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(drafts.filter((_, current) => current !== index))}
              >
                Quitar atributo
              </Button>
            </div>
          </div>
        );
      })}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={drafts.length >= MAX_CATEGORY_ATTRIBUTES}
        onClick={() => onChange([...drafts, EMPTY_DRAFT])}
      >
        Añadir atributo
      </Button>
    </div>
  );
}
