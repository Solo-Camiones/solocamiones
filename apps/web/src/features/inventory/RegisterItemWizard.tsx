import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import type { Category, ItemCondition } from '../../api/contracts/entities';
import type { AssemblyBaselineEntry, RegisterItemInput } from '../../api/contracts/inventory';
import { inventoryRepository } from '../../api/repositories';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { UX_TERMS } from '../../shared/copy/glossary';
import { Button, Field, Info, Input, Modal, Select, Textarea } from '../../shared/ui';
import { BaselineChecklist } from './BaselineChecklist';
import { CategoryAttributeFields } from './CategoryAttributeFields';
import { ITEM_CONDITIONS } from './item-conditions';
import { OptionalDetails } from './OptionalDetails';
import { PhotoEditor } from './PhotoEditor';
import {
  mergeBaselineEntries,
  pendingEnrichmentLabels,
  type RegistrationMode,
} from './registration-enrichment';

type RegisterItemWizardProps = {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onRegistered: (id: string) => void;
};

const EMPTY_ITEM: RegisterItemInput = {
  name: '',
  categoryId: '',
  condition: 'USED',
  photos: [],
};

const REGISTER_STEP1_FORM_ID = 'register-item-step-1';
const REGISTER_STEP2_FORM_ID = 'register-item-step-2';

type RegisteredSummary = {
  id: string;
  mode: RegistrationMode;
  pending: string[];
};

export function RegisterItemWizard({
  open,
  categories,
  onClose,
  onRegistered,
}: RegisterItemWizardProps) {
  const navigate = useNavigate();
  const { hierarchy } = useAppCapabilities();
  const [mode, setMode] = useState<RegistrationMode>('INDIVIDUAL');
  const [step, setStep] = useState<1 | 2>(1);
  const [item, setItem] = useState<RegisterItemInput>(EMPTY_ITEM);
  const [qtySku, setQtySku] = useState('');
  const [initialQuantity, setInitialQuantity] = useState('0');
  const [unitCostDop, setUnitCostDop] = useState('');
  const [baseline, setBaseline] = useState<AssemblyBaselineEntry[]>([]);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [registered, setRegistered] = useState<RegisteredSummary>();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const visibleCategories = hierarchy
    ? categories
    : categories.filter((category) => !category.isAssembly);
  const selectedCategory = useMemo(
    () => visibleCategories.find((category) => category.id === item.categoryId),
    [visibleCategories, item.categoryId],
  );
  const isAssemblyFlow =
    Boolean(hierarchy) && mode === 'INDIVIDUAL' && Boolean(selectedCategory?.isAssembly);
  const categoryAttributes = selectedCategory?.attributes ?? [];
  const showCharacteristics = mode === 'INDIVIDUAL' && categoryAttributes.length > 0;
  const hasUnsavedChanges =
    !registered &&
    (mode !== 'INDIVIDUAL' ||
      step !== 1 ||
      JSON.stringify(item) !== JSON.stringify(EMPTY_ITEM) ||
      qtySku !== '' ||
      initialQuantity !== '0' ||
      unitCostDop !== '' ||
      baseline.length > 0);

  const patchItem = (patch: Partial<RegisterItemInput>) =>
    setItem((current) => ({ ...current, ...patch }));
  const reset = () => {
    setMode('INDIVIDUAL');
    setStep(1);
    setItem(EMPTY_ITEM);
    setQtySku('');
    setInitialQuantity('0');
    setUnitCostDop('');
    setBaseline([]);
    setError(undefined);
    setSaving(false);
    setRegistered(undefined);
    setConfirmingDiscard(false);
  };
  const close = () => {
    reset();
    onClose();
  };
  const requestClose = () => {
    if (saving) {
      return;
    }
    if (confirmingDiscard) {
      setConfirmingDiscard(false);
      return;
    }
    if (hasUnsavedChanges) {
      setConfirmingDiscard(true);
      return;
    }
    close();
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    const normalizedItem = item;
    const result =
      mode === 'QUANTITY'
        ? await inventoryRepository.registerQtyProduct({
            id: qtySku,
            name: item.name,
            categoryId: item.categoryId,
            brand: item.brand,
            location: item.location,
            initialQuantity: Number(initialQuantity),
            unitCostDop: Number(unitCostDop),
          })
        : selectedCategory?.isAssembly
          ? await inventoryRepository.registerAssembly({ parent: normalizedItem, baseline })
          : await inventoryRepository.registerItem(normalizedItem);
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const id = 'parent' in result.value ? result.value.parent.id : result.value.id;
    onRegistered(id);
    setRegistered({
      id,
      mode,
      pending: pendingEnrichmentLabels(mode, normalizedItem, selectedCategory?.attributes),
    });
  };

  const handleFirstStep = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    if (isAssemblyFlow) {
      setBaseline(mergeBaselineEntries(selectedCategory?.expectedComponents ?? [], baseline));
      setStep(2);
      return;
    }
    void save();
  };

  const modalTitle = confirmingDiscard
    ? '¿Descartar el registro?'
    : registered
      ? 'Inventario registrado'
      : isAssemblyFlow && step === 2
        ? 'Registrar ensamblaje'
        : 'Registrar inventario';

  const footer = confirmingDiscard ? (
    <>
      <Button variant="secondary" onClick={() => setConfirmingDiscard(false)} autoFocus>
        Seguir registrando
      </Button>
      <Button variant="danger" onClick={close}>
        Descartar registro
      </Button>
    </>
  ) : registered ? (
    <>
      <Button variant="secondary" onClick={close}>
        Volver al listado
      </Button>
      <Button
        onClick={() => {
          const itemId = registered.id;
          close();
          navigate(`/inventory/${itemId}`);
        }}
      >
        {registered.mode === 'QUANTITY' ? 'Ver producto' : 'Ver pieza'}
      </Button>
    </>
  ) : step === 2 ? (
    <>
      <Button variant="secondary" onClick={requestClose} disabled={saving}>
        Cancelar
      </Button>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setStep(1)} disabled={saving}>
          Atrás
        </Button>
        <Button type="submit" form={REGISTER_STEP2_FORM_ID} disabled={saving} busy={saving}>
          {saving ? 'Guardando…' : 'Registrar ensamblaje'}
        </Button>
      </div>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={requestClose} disabled={saving}>
        Cancelar
      </Button>
      <Button type="submit" form={REGISTER_STEP1_FORM_ID} disabled={saving} busy={saving}>
        {isAssemblyFlow ? 'Continuar' : saving ? 'Guardando…' : 'Registrar'}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      title={modalTitle}
      onClose={requestClose}
      dismissible={!saving}
      size="lg"
      footer={footer}
    >
      {confirmingDiscard ? (
        <Info tone="warning" title="La información todavía no se ha guardado">
          Si descarta el registro, perderá los datos y componentes que haya completado.
        </Info>
      ) : registered ? (
        <Info tone="success" title={`${registered.id} quedó registrado`}>
          <p>Ya está en inventario y puede buscarse en el listado.</p>
          {registered.pending.length > 0 ? (
            <>
              <p className="mt-2">Aún puede completar: {registered.pending.join(', ')}.</p>
              <p className="mt-1">Esa información se añade después desde el detalle de la pieza.</p>
            </>
          ) : (
            <p className="mt-2">No quedó información adicional pendiente.</p>
          )}
        </Info>
      ) : step === 1 ? (
        <form id={REGISTER_STEP1_FORM_ID} className="space-y-4" onSubmit={handleFirstStep}>
          {isAssemblyFlow && (
            <p className="text-sm font-medium text-navy" aria-live="polite">
              Paso 1 de 2 — Información del ensamblaje
            </p>
          )}

          {error && (
            <Info tone="error" title="No se pudo registrar">
              {error}
            </Info>
          )}

          <FormSection legend="Identificación">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre" htmlFor="register-name">
                <Input
                  id="register-name"
                  value={item.name}
                  onChange={(event) => patchItem({ name: event.target.value })}
                  required
                />
              </Field>
              <Field label="Categoría" htmlFor="register-category">
                <Select
                  id="register-category"
                  value={item.categoryId}
                  searchable
                  searchPlaceholder="Buscar categoría"
                  onChange={(event) =>
                    patchItem({ categoryId: event.target.value, attributes: undefined })
                  }
                  required
                >
                  <option value="">Seleccione…</option>
                  {visibleCategories.map((category) => (
                    <option
                      key={category.id}
                      value={category.id}
                      disabled={mode === 'QUANTITY' && category.isAssembly}
                    >
                      {category.name}
                      {category.isAssembly ? ` · ${UX_TERMS.assembly}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              {mode === 'QUANTITY' ? (
                <Field
                  label="Código de producto"
                  htmlFor="register-id"
                  hint="SKU del producto intercambiable, no un código por unidad."
                >
                  <Input
                    id="register-id"
                    value={qtySku}
                    onChange={(event) => setQtySku(event.target.value)}
                    required
                  />
                </Field>
              ) : (
                <InternalCodeInfo codePrefix={selectedCategory?.codePrefix} />
              )}
            </div>
          </FormSection>

          <FormSection legend="Inventario">
            <div className="space-y-2">
              <p className="text-sm font-medium text-navy">Tipo de registro</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="rounded-lg border border-navy-200 p-3 text-sm">
                  <input
                    type="radio"
                    name="registration-mode"
                    checked={mode === 'INDIVIDUAL'}
                    onChange={() => setMode('INDIVIDUAL')}
                  />{' '}
                  Pieza individual
                </label>
                <label className="rounded-lg border border-navy-200 p-3 text-sm">
                  <input
                    type="radio"
                    name="registration-mode"
                    checked={mode === 'QUANTITY'}
                    onChange={() => setMode('QUANTITY')}
                  />{' '}
                  {UX_TERMS.quantityItem}
                </label>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {mode === 'INDIVIDUAL' && (
                <>
                  <Field label="Condición" htmlFor="register-condition">
                    <Select
                      id="register-condition"
                      value={item.condition}
                      onChange={(event) =>
                        patchItem({ condition: event.target.value as ItemCondition })
                      }
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
                    htmlFor="register-cost"
                    hint="Déjelo vacío si todavía no se conoce. Vacío no es cero."
                  >
                    <Input
                      id="register-cost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.acquisitionCostDop ?? ''}
                      onChange={(event) =>
                        patchItem({
                          acquisitionCostDop:
                            event.target.value === '' ? undefined : Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                </>
              )}
              {mode === 'QUANTITY' && (
                <>
                  <Field
                    label="Existencia inicial"
                    htmlFor="register-quantity"
                    hint="Cantidad que entra ahora. Recibos posteriores se registran después."
                  >
                    <Input
                      id="register-quantity"
                      type="number"
                      min="0"
                      step="1"
                      value={initialQuantity}
                      onChange={(event) => setInitialQuantity(event.target.value)}
                      required
                    />
                  </Field>
                  <Field
                    label="Costo unitario en pesos"
                    htmlFor="register-unit-cost"
                    hint="Costo en DOP de esta entrada."
                  >
                    <Input
                      id="register-unit-cost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={unitCostDop}
                      onChange={(event) => setUnitCostDop(event.target.value)}
                      required
                    />
                  </Field>
                </>
              )}
              <Field label="Ubicación (opcional)" htmlFor="register-location">
                <Input
                  id="register-location"
                  value={item.location ?? ''}
                  onChange={(event) => patchItem({ location: event.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          {showCharacteristics && (
            <FormSection legend="Características">
              <CategoryAttributeFields
                definitions={categoryAttributes}
                values={item.attributes}
                idPrefix="register-attr"
                onChange={(attributes) => patchItem({ attributes })}
              />
            </FormSection>
          )}

          {mode === 'INDIVIDUAL' && (
            <FormSection legend="Evidencia">
              <PhotoEditor
                photos={item.photos ?? []}
                onChange={(photos) => patchItem({ photos })}
              />
            </FormSection>
          )}

          <OptionalDetails>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Marca (opcional)" htmlFor="register-brand">
                <Input
                  id="register-brand"
                  value={item.brand ?? ''}
                  onChange={(event) => patchItem({ brand: event.target.value })}
                />
              </Field>
              {mode === 'INDIVIDUAL' && (
                <>
                  <Field label="Modelo (opcional)" htmlFor="register-model">
                    <Input
                      id="register-model"
                      value={item.model ?? ''}
                      onChange={(event) => patchItem({ model: event.target.value })}
                    />
                  </Field>
                  <Field label="Serial (opcional)" htmlFor="register-serial">
                    <Input
                      id="register-serial"
                      value={item.serial ?? ''}
                      onChange={(event) => patchItem({ serial: event.target.value })}
                    />
                  </Field>
                  <Field label="Número de parte (opcional)" htmlFor="register-part">
                    <Input
                      id="register-part"
                      value={item.partNumber ?? ''}
                      onChange={(event) => patchItem({ partNumber: event.target.value })}
                    />
                  </Field>
                  <Field
                    label="Procedencia del costo (opcional)"
                    htmlFor="register-cost-source"
                    hint="Por ejemplo: factura, estimado."
                  >
                    <Input
                      id="register-cost-source"
                      value={item.costProvenance ?? ''}
                      onChange={(event) => patchItem({ costProvenance: event.target.value })}
                    />
                  </Field>
                </>
              )}
            </div>
            {mode === 'INDIVIDUAL' && (
              <Field label="Notas (opcional)" htmlFor="register-notes">
                <Textarea
                  id="register-notes"
                  rows={3}
                  value={item.notes ?? ''}
                  onChange={(event) => patchItem({ notes: event.target.value })}
                />
              </Field>
            )}
          </OptionalDetails>
        </form>
      ) : (
        <form
          id={REGISTER_STEP2_FORM_ID}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p className="text-sm font-medium text-navy" aria-live="polite">
            Paso 2 de 2 — Componentes iniciales
          </p>
          {error && (
            <Info tone="error" title="No se pudo registrar">
              {error}
            </Info>
          )}
          <BaselineChecklist
            expectedComponents={selectedCategory?.expectedComponents ?? []}
            categories={categories}
            entries={baseline}
            onChange={setBaseline}
          />
        </form>
      )}
    </Modal>
  );
}

/** Visual grouping inside step 1 — not extra wizard steps. */
function FormSection({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-navy-200 p-4">
      <legend className="px-1 text-sm font-semibold text-navy">{legend}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Internal codes are assigned on save. Showing them as a disabled input
 * implied the operator could (or should) edit the value.
 */
function InternalCodeInfo({ codePrefix }: { codePrefix?: string }) {
  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <p className="text-sm font-medium text-navy">Código interno</p>
      <p className="text-sm text-navy-400">
        {codePrefix
          ? `Se asignará al guardar con prefijo ${codePrefix}.`
          : 'Se generará automáticamente al registrar.'}
      </p>
    </div>
  );
}
