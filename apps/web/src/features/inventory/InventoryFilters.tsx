import type { Category, CommercialState, ItemCondition } from '../../api/contracts/entities';
import type {
  InventoryKind,
  InventoryListFilters,
  InventoryQuickFilter,
} from '../../api/contracts/inventory';
import { UX_TERMS } from '../../shared/copy/glossary';
import { commercialAvailabilityLabel } from '../../shared/domain';
import { Button, Chip, Field, Input, SearchInput, Select } from '../../shared/ui';
import { ITEM_CONDITIONS } from './item-conditions';

export type InventoryFiltersProps = {
  filters: InventoryListFilters;
  categories: Category[];
  onChange: (patch: Partial<InventoryListFilters>) => void;
};

const QUICK_FILTERS: { key: InventoryQuickFilter; label: string }[] = [
  { key: 'available', label: 'Disponible' },
  { key: 'installed', label: 'Instalado' },
  { key: 'independent', label: 'Independiente' },
  { key: 'reserved', label: 'Reservado' },
  { key: 'assemblies', label: 'Ensamblajes' },
  { key: 'incomplete', label: 'Incompletos' },
  { key: 'quantity', label: 'Por cantidad' },
];

const COMMERCIAL_OPTIONS: Array<CommercialState | 'UNAVAILABLE'> = [
  'AVAILABLE',
  'SOLD',
  'UNAVAILABLE',
];

const KIND_OPTIONS: { value: InventoryKind; label: string }[] = [
  { value: 'ITEM', label: 'Pieza individual' },
  { value: 'QTY', label: UX_TERMS.quantityItem },
];

function parseCondition(value: string): ItemCondition | undefined {
  return ITEM_CONDITIONS.some((entry) => entry.value === value)
    ? (value as ItemCondition)
    : undefined;
}

function parseCommercial(value: string): CommercialState | 'UNAVAILABLE' | undefined {
  return COMMERCIAL_OPTIONS.includes(value as CommercialState | 'UNAVAILABLE')
    ? (value as CommercialState | 'UNAVAILABLE')
    : undefined;
}

function parseKind(value: string): InventoryKind | undefined {
  return KIND_OPTIONS.some((entry) => entry.value === value) ? (value as InventoryKind) : undefined;
}

const CLEARED_FILTERS: InventoryListFilters = {
  query: '',
  categoryId: undefined,
  includeSold: false,
  quick: undefined,
  location: undefined,
  condition: undefined,
  commercialState: undefined,
  kind: undefined,
  pendingCatalog: false,
};

type ActiveChip = {
  id: string;
  label: string;
  patch: Partial<InventoryListFilters>;
};

function toggleQuick(
  current: InventoryQuickFilter[] | undefined,
  key: InventoryQuickFilter,
): InventoryQuickFilter[] | undefined {
  const selected = new Set(current ?? []);
  if (selected.has(key)) {
    selected.delete(key);
  } else {
    selected.add(key);
  }
  const next = QUICK_FILTERS.map((entry) => entry.key).filter((entry) => selected.has(entry));
  return next.length > 0 ? next : undefined;
}

function conditionLabel(value: ItemCondition): string {
  return ITEM_CONDITIONS.find((entry) => entry.value === value)?.label ?? value;
}

function kindLabel(value: InventoryKind): string {
  return KIND_OPTIONS.find((entry) => entry.value === value)?.label ?? value;
}

/**
 * Chips for operational filters only. The search box already shows `query`,
 * so it is not repeated here; Limpiar filtros still resets it.
 */
function activeFilterChips(
  filters: InventoryListFilters,
  categories: Category[],
): ActiveChip[] {
  const chips: ActiveChip[] = [];

  for (const entry of QUICK_FILTERS) {
    if (!filters.quick?.includes(entry.key)) {
      continue;
    }
    chips.push({
      id: `quick-${entry.key}`,
      label: entry.label,
      patch: {
        quick: toggleQuick(filters.quick, entry.key),
      },
    });
  }

  if (filters.categoryId) {
    const categoryName =
      categories.find((entry) => entry.id === filters.categoryId)?.name ?? filters.categoryId;
    chips.push({
      id: 'category',
      label: categoryName,
      patch: { categoryId: undefined },
    });
  }

  if (filters.location?.trim()) {
    chips.push({
      id: 'location',
      label: filters.location.trim(),
      patch: { location: undefined },
    });
  }

  if (filters.condition) {
    chips.push({
      id: 'condition',
      label: conditionLabel(filters.condition),
      patch: { condition: undefined },
    });
  }

  if (filters.commercialState) {
    chips.push({
      id: 'commercial',
      label: commercialAvailabilityLabel(filters.commercialState),
      patch: { commercialState: undefined },
    });
  }

  if (filters.includeSold) {
    chips.push({
      id: 'sold',
      label: 'Vendidos',
      patch: { includeSold: false },
    });
  }

  if (filters.kind) {
    chips.push({
      id: 'kind',
      label: kindLabel(filters.kind),
      patch: { kind: undefined },
    });
  }

  if (filters.pendingCatalog) {
    chips.push({
      id: 'pendingCatalog',
      label: UX_TERMS.componentsPendingConfirm,
      patch: { pendingCatalog: false },
    });
  }

  return chips;
}

function quickToggleClass(pressed: boolean): string {
  const base =
    'min-h-11 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light/50';
  return pressed
    ? `${base} border-brand/30 bg-brand/10 text-brand-dark`
    : `${base} border-navy-200 bg-white text-navy hover:bg-navy-50`;
}

export function InventoryFilters({ filters, categories, onChange }: InventoryFiltersProps) {
  const chips = activeFilterChips(filters, categories);
  const quick = filters.quick ?? [];

  return (
    <div className="mb-6 flex flex-col gap-4">
      <SearchInput
        id="inventory-search"
        className="max-w-md"
        label="Buscar inventario"
        placeholder="ID, nombre, marca, serial, número de parte…"
        value={filters.query ?? ''}
        onChange={(event) => onChange({ query: event.target.value })}
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros rápidos">
        {QUICK_FILTERS.map((entry) => {
          const pressed = quick.includes(entry.key);
          return (
            <button
              key={entry.key}
              type="button"
              aria-pressed={pressed}
              className={quickToggleClass(pressed)}
              onClick={() => onChange({ quick: toggleQuick(filters.quick, entry.key) })}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <details className="rounded-lg border border-navy-200 bg-navy-50/40 p-3">
        <summary className="cursor-pointer text-sm font-medium text-navy">Más filtros</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Categoría" htmlFor="inventory-category">
            <Select
              id="inventory-category"
              value={filters.categoryId ?? ''}
              searchable
              searchPlaceholder="Buscar categoría"
              onChange={(event) => onChange({ categoryId: event.target.value || undefined })}
            >
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Ubicación" htmlFor="inventory-location">
            <Input
              id="inventory-location"
              value={filters.location ?? ''}
              placeholder="Almacén, patio, estante…"
              onChange={(event) => onChange({ location: event.target.value || undefined })}
            />
          </Field>

          <Field label="Condición" htmlFor="inventory-condition">
            <Select
              id="inventory-condition"
              value={filters.condition ?? ''}
              onChange={(event) => onChange({ condition: parseCondition(event.target.value) })}
            >
              <option value="">Todas</option>
              {ITEM_CONDITIONS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Estado comercial" htmlFor="inventory-commercial">
            <Select
              id="inventory-commercial"
              value={filters.commercialState ?? ''}
              onChange={(event) =>
                onChange({ commercialState: parseCommercial(event.target.value) })
              }
            >
              <option value="">Todos</option>
              {COMMERCIAL_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {commercialAvailabilityLabel(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Tipo de inventario" htmlFor="inventory-kind">
            <Select
              id="inventory-kind"
              value={filters.kind ?? ''}
              onChange={(event) => onChange({ kind: parseKind(event.target.value) })}
            >
              <option value="">Todos</option>
              {KIND_OPTIONS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>

          <label className="flex items-center gap-2 self-end pb-2 text-sm text-navy">
            <input
              type="checkbox"
              className="size-4 rounded border-navy-200"
              checked={filters.includeSold === true}
              onChange={(event) => onChange({ includeSold: event.target.checked })}
            />
            Vendidos
          </label>
        </div>
      </details>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-navy-400">Filtros activos:</span>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-label={`Quitar filtro ${chip.label}`}
              onClick={() => onChange(chip.patch)}
            >
              <Chip>
                {chip.label}
                <span aria-hidden="true" className="ml-1">
                  ×
                </span>
              </Chip>
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => onChange(CLEARED_FILTERS)}>
            Limpiar filtros
          </Button>
        </div>
      ) : null}
    </div>
  );
}
