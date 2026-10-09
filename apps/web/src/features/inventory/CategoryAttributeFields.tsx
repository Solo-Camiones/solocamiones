import type { CategoryAttributeDefinition } from '../../api/contracts/entities';
import { categoryAttributeTypeLabel } from '../../shared/domain/category-attributes';
import { Field, Input, Select } from '../../shared/ui';

type CategoryAttributeFieldsProps = {
  definitions: CategoryAttributeDefinition[];
  values: Record<string, string> | undefined;
  idPrefix: string;
  onChange: (values: Record<string, string>) => void;
};

function patchValue(
  values: Record<string, string> | undefined,
  key: string,
  next: string,
): Record<string, string> {
  const updated = { ...(values ?? {}) };
  if (next.trim()) {
    updated[key] = next;
  } else {
    delete updated[key];
  }
  return updated;
}

/**
 * Renders the category schema as concrete fields. Operators never type attribute keys.
 */
export function CategoryAttributeFields({
  definitions,
  values,
  idPrefix,
  onChange,
}: CategoryAttributeFieldsProps) {
  if (definitions.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {definitions.map((definition) => {
        const fieldId = `${idPrefix}-${definition.key}`;
        const value = values?.[definition.key] ?? '';
        const label = definition.required ? definition.label : `${definition.label} (opcional)`;

        if (definition.type === 'select') {
          return (
            <Field key={definition.key} label={label} htmlFor={fieldId}>
              <Select
                id={fieldId}
                value={value}
                required={definition.required}
                onChange={(event) =>
                  onChange(patchValue(values, definition.key, event.target.value))
                }
              >
                <option value="">Seleccione…</option>
                {(definition.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Field>
          );
        }

        return (
          <Field
            key={definition.key}
            label={label}
            htmlFor={fieldId}
            hint={
              definition.type === 'number' ? categoryAttributeTypeLabel(definition.type) : undefined
            }
          >
            <Input
              id={fieldId}
              type={definition.type === 'number' ? 'number' : 'text'}
              step={definition.type === 'number' ? 'any' : undefined}
              value={value}
              required={definition.required}
              onChange={(event) => onChange(patchValue(values, definition.key, event.target.value))}
            />
          </Field>
        );
      })}
    </div>
  );
}
