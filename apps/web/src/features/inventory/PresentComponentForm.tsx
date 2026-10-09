import type { Category, ItemCondition } from '../../api/contracts/entities';
import type { RegisterItemInput } from '../../api/contracts/inventory';
import { Field, Input, Select } from '../../shared/ui';
import { CategoryAttributeFields } from './CategoryAttributeFields';
import { ITEM_CONDITIONS } from './item-conditions';
import { OptionalDetails } from './OptionalDetails';

type PresentComponentFormProps = {
  expectedName: string;
  category: Category | undefined;
  value: RegisterItemInput | undefined;
  onChange: (value: RegisterItemInput) => void;
  path: string;
};

export function PresentComponentForm({
  expectedName,
  category,
  value,
  onChange,
  path,
}: PresentComponentFormProps) {
  if (!category) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        No hay una categoría configurada para “{expectedName}”. Use Faltante o No aplica.
      </p>
    );
  }

  const current: RegisterItemInput = value ?? {
    name: expectedName,
    categoryId: category.id,
    condition: 'USED',
  };
  const patch = (next: Partial<RegisterItemInput>) => onChange({ ...current, ...next });
  const prefix = `component-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  return (
    <div className="space-y-3 rounded-lg border border-navy-100 bg-navy-50 p-3">
      <p className="text-sm text-navy-400">
        Código al guardar: <span className="font-mono text-navy">{category.codePrefix}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" htmlFor={`${prefix}-name`}>
          <Input
            id={`${prefix}-name`}
            value={current.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>
        <Field label="Condición" htmlFor={`${prefix}-condition`}>
          <Select
            id={`${prefix}-condition`}
            value={current.condition}
            onChange={(event) => patch({ condition: event.target.value as ItemCondition })}
          >
            {ITEM_CONDITIONS.map((condition) => (
              <option key={condition.value} value={condition.value}>
                {condition.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Costo en pesos (opcional)"
          htmlFor={`${prefix}-cost`}
          hint="Déjelo vacío si todavía no se conoce."
        >
          <Input
            id={`${prefix}-cost`}
            type="number"
            min="0"
            step="0.01"
            value={current.acquisitionCostDop ?? ''}
            onChange={(event) =>
              patch({
                acquisitionCostDop:
                  event.target.value === '' ? undefined : Number(event.target.value),
              })
            }
          />
        </Field>
      </div>
      {(category.attributes?.length ?? 0) > 0 && (
        <CategoryAttributeFields
          definitions={category.attributes ?? []}
          values={current.attributes}
          idPrefix={`${prefix}-attr`}
          onChange={(attributes) => patch({ attributes })}
        />
      )}
      <OptionalDetails summary="Datos adicionales del componente (opcional)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Marca (opcional)" htmlFor={`${prefix}-brand`}>
            <Input
              id={`${prefix}-brand`}
              value={current.brand ?? ''}
              onChange={(event) => patch({ brand: event.target.value })}
            />
          </Field>
          <Field label="Serial (opcional)" htmlFor={`${prefix}-serial`}>
            <Input
              id={`${prefix}-serial`}
              value={current.serial ?? ''}
              onChange={(event) => patch({ serial: event.target.value })}
            />
          </Field>
          <Field label="Número de parte (opcional)" htmlFor={`${prefix}-part`}>
            <Input
              id={`${prefix}-part`}
              value={current.partNumber ?? ''}
              onChange={(event) => patch({ partNumber: event.target.value })}
            />
          </Field>
        </div>
      </OptionalDetails>
    </div>
  );
}
