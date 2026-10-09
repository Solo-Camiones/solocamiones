import { useEffect, useState } from 'react';

import type { Category, ItemCondition } from '../../api/contracts/entities';
import type {
  AssemblyBaselineEntry,
  ItemDetailView,
  RegisterItemInput,
} from '../../api/contracts/inventory';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { UX_TERMS } from '../../shared/copy/glossary';
import {
  Button,
  Field,
  GuardedModal,
  Info,
  Input,
  Select,
  Textarea,
  isFormDirty,
} from '../../shared/ui';
import { BaselineChecklist } from './BaselineChecklist';

type ItemAdminActionsProps = {
  detail: ItemDetailView;
  isMutating: boolean;
  onSetNoDesarmar: (enabled: boolean) => Promise<string | null>;
  onCorrectCost: (input: {
    acquisitionCostDop?: number;
    costProvenance?: string | null;
    reason: string;
  }) => Promise<string | null>;
  onCorrectBaseline: (input: {
    reason: string;
    markNotApplicable: string[];
  }) => Promise<string | null>;
  onResolveCatalogReview: (input: {
    expectedComponentName: string;
    decision: 'NOT_APPLICABLE' | 'MISSING' | 'PRESENT' | 'ACKNOWLEDGE';
    item?: RegisterItemInput;
    baseline?: AssemblyBaselineEntry[];
  }) => Promise<string | null>;
  onCreateWorkOrder: (input: {
    type: 'DISMANTLING' | 'INSTALLATION';
    destinationParentId?: string;
    notes?: string;
  }) => Promise<string | null>;
};

export function ItemAdminActions({
  detail,
  isMutating,
  onSetNoDesarmar,
  onCorrectCost,
  onCorrectBaseline,
  onResolveCatalogReview,
  onCreateWorkOrder,
}: ItemAdminActionsProps) {
  const { workOrders, hierarchy } = useAppCapabilities();
  const [error, setError] = useState<string | null>(null);
  const [costOpen, setCostOpen] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [woOpen, setWoOpen] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [presentFor, setPresentFor] = useState<string | null>(null);
  const [costDirty, setCostDirty] = useState(false);
  const [baselineDirty, setBaselineDirty] = useState(false);
  const [woDirty, setWoDirty] = useState(false);

  const flagOnThisItem = detail.protectedRootId === detail.id;

  return (
    <div className="flex flex-col gap-2">
      {error && !costOpen && !baselineOpen && !woOpen && (
        <Info tone="error" title="No se pudo completar la acción">
          {error}
        </Info>
      )}
      {hierarchy && detail.pendingCatalogReviews.length > 0 && (
        <div className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-navy">
          <p className="font-medium">Validar componentes nuevos del catálogo</p>
          <p className="mt-1 text-navy-400">
            Si la pieza ya estaba en el ensamblaje, aparece en el árbol. Si no, confirme que no
            aplica, regístrela presente o márquela falta.
          </p>
          {reviewError && (
            <div className="mt-2">
              <Info tone="error" title="No se pudo validar">
                {reviewError}
              </Info>
            </div>
          )}
          <ul className="mt-2 space-y-2">
            {detail.pendingCatalogReviews.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5"
              >
                <span>
                  {entry.expectedComponentName}
                  {entry.kind === 'ALREADY_PRESENT' && entry.matchedChildId
                    ? ` · ya en árbol (${entry.matchedChildId})`
                    : ''}
                </span>
                <span className="flex flex-wrap gap-1">
                  {entry.kind === 'ALREADY_PRESENT' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isMutating}
                      onClick={async () => {
                        const message = await onResolveCatalogReview({
                          expectedComponentName: entry.expectedComponentName,
                          decision: 'ACKNOWLEDGE',
                        });
                        setReviewError(message);
                      }}
                    >
                      Entendido
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isMutating}
                        onClick={async () => {
                          const message = await onResolveCatalogReview({
                            expectedComponentName: entry.expectedComponentName,
                            decision: 'NOT_APPLICABLE',
                          });
                          setReviewError(message);
                        }}
                      >
                        Confirmar que no aplica
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isMutating || !entry.matchingCategoryId}
                        title={
                          entry.matchingCategoryId
                            ? undefined
                            : `Cree una categoría llamada ${entry.expectedComponentName}`
                        }
                        onClick={() => {
                          setReviewError(null);
                          setPresentFor(entry.expectedComponentName);
                        }}
                      >
                        Registrar presente
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isMutating}
                        onClick={async () => {
                          const message = await onResolveCatalogReview({
                            expectedComponentName: entry.expectedComponentName,
                            decision: 'MISSING',
                          });
                          setReviewError(message);
                        }}
                      >
                        Marcar falta
                      </Button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {presentFor && (
        <PresentChildForm
          expectedComponentName={presentFor}
          categoryId={
            detail.pendingCatalogReviews.find((entry) => entry.expectedComponentName === presentFor)
              ?.matchingCategoryId ?? ''
          }
          categories={detail.catalogCategories}
          disabled={isMutating}
          error={reviewError}
          onCancel={() => {
            setPresentFor(null);
            setReviewError(null);
          }}
          onSubmit={async (item, baseline) => {
            const message = await onResolveCatalogReview({
              expectedComponentName: presentFor,
              decision: 'PRESENT',
              item,
              baseline,
            });
            if (message) {
              setReviewError(message);
              return;
            }
            setPresentFor(null);
            setReviewError(null);
          }}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {hierarchy && detail.isAssembly && (
          <Button
            variant="secondary"
            size="sm"
            disabled={isMutating}
            onClick={async () => {
              setError(await onSetNoDesarmar(!flagOnThisItem));
            }}
          >
            {flagOnThisItem ? 'Quitar No desarmar' : 'Aplicar No desarmar'}
          </Button>
        )}
        {workOrders && (
          <Button
            variant="secondary"
            size="sm"
            disabled={isMutating}
            onClick={() => {
              setError(null);
              setWoOpen(true);
            }}
          >
            Orden de trabajo manual
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={isMutating}
          onClick={() => {
            setError(null);
            setCostOpen(true);
          }}
        >
          Corregir costo
        </Button>
        {hierarchy &&
          detail.missingComponents.some((entry) => entry.origin === 'MISSING_AT_RECEIPT') && (
            <Button
              variant="secondary"
              size="sm"
              disabled={isMutating}
              onClick={() => {
                setError(null);
                setBaselineOpen(true);
              }}
            >
              Corregir {UX_TERMS.receiptRecord.toLowerCase()}
            </Button>
          )}
      </div>

      <GuardedModal
        open={costOpen}
        title="Corregir costo de adquisición"
        onClose={() => {
          setError(null);
          setCostOpen(false);
          setCostDirty(false);
        }}
        hasUnsavedChanges={costDirty}
        isBusy={isMutating}
      >
        {({ requestClose }) => (
          <div className="space-y-3">
            {error && (
              <Info tone="error" title="No se pudo corregir el costo">
                {error}
              </Info>
            )}
            <CostForm
              current={detail.acquisitionCostDop}
              provenance={detail.costProvenance}
              disabled={isMutating}
              onDirtyChange={setCostDirty}
              onCancel={requestClose}
              onSubmit={async (input) => {
                const message = await onCorrectCost(input);
                if (message) {
                  setError(message);
                  return;
                }
                setError(null);
                setCostOpen(false);
                setCostDirty(false);
              }}
            />
          </div>
        )}
      </GuardedModal>

      <GuardedModal
        open={baselineOpen}
        title={`Corregir ${UX_TERMS.receiptRecord.toLowerCase()}`}
        onClose={() => {
          setError(null);
          setBaselineOpen(false);
          setBaselineDirty(false);
        }}
        hasUnsavedChanges={baselineDirty}
        isBusy={isMutating}
      >
        {({ requestClose }) => (
          <div className="space-y-3">
            {error && (
              <Info
                tone="error"
                title={`No se pudo corregir el ${UX_TERMS.receiptRecord.toLowerCase()}`}
              >
                {error}
              </Info>
            )}
            <BaselineForm
              missing={detail.missingComponents
                .filter((entry) => entry.origin === 'MISSING_AT_RECEIPT')
                .map((entry) => entry.expectedComponentName)}
              disabled={isMutating}
              onDirtyChange={setBaselineDirty}
              onCancel={requestClose}
              onSubmit={async (input) => {
                const message = await onCorrectBaseline(input);
                if (message) {
                  setError(message);
                  return;
                }
                setError(null);
                setBaselineOpen(false);
                setBaselineDirty(false);
              }}
            />
          </div>
        )}
      </GuardedModal>

      <GuardedModal
        open={woOpen && workOrders}
        title="Crear orden de trabajo manual"
        onClose={() => {
          setError(null);
          setWoOpen(false);
          setWoDirty(false);
        }}
        hasUnsavedChanges={woDirty}
        isBusy={isMutating}
      >
        {({ requestClose }) => (
          <div className="space-y-3">
            {error && (
              <Info tone="error" title="No se pudo crear la orden de trabajo">
                {error}
              </Info>
            )}
            <WorkOrderForm
              pieceId={detail.id}
              relationship={detail.physicalRelationship}
              disabled={isMutating}
              onDirtyChange={setWoDirty}
              onCancel={requestClose}
              onSubmit={async (input) => {
                const message = await onCreateWorkOrder(input);
                if (message) {
                  setError(message);
                  return;
                }
                setError(null);
                setWoOpen(false);
                setWoDirty(false);
              }}
            />
          </div>
        )}
      </GuardedModal>
    </div>
  );
}

function CostForm({
  current,
  provenance,
  disabled,
  onDirtyChange,
  onCancel,
  onSubmit,
}: {
  current?: number;
  provenance?: string;
  disabled: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSubmit: (input: {
    acquisitionCostDop?: number;
    costProvenance?: string | null;
    reason: string;
  }) => Promise<void>;
}) {
  const [amount, setAmount] = useState(current != null ? String(current) : '');
  const [unknown, setUnknown] = useState(current == null);
  const [costProvenance, setCostProvenance] = useState(provenance ?? '');
  const [reason, setReason] = useState('');

  useEffect(() => {
    onDirtyChange(
      isFormDirty(
        {
          amount,
          unknown,
          costProvenance,
          reason,
        },
        {
          amount: current != null ? String(current) : '',
          unknown: current == null,
          costProvenance: provenance ?? '',
          reason: '',
        },
      ),
    );
  }, [amount, unknown, costProvenance, reason, current, provenance, onDirtyChange]);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          acquisitionCostDop: unknown || amount.trim() === '' ? undefined : Number(amount),
          costProvenance: costProvenance.trim() || null,
          reason,
        });
      }}
    >
      <label className="flex items-center gap-2 text-sm text-navy">
        <input
          type="checkbox"
          checked={unknown}
          onChange={(event) => setUnknown(event.target.checked)}
        />
        Costo desconocido
      </label>
      {!unknown && (
        <Field label="Costo en pesos" htmlFor="cost-dop">
          <Input
            id="cost-dop"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
      )}
      <Field label="Procedencia" htmlFor="cost-provenance">
        <Input
          id="cost-provenance"
          value={costProvenance}
          onChange={(event) => setCostProvenance(event.target.value)}
        />
      </Field>
      <Field label="Motivo" htmlFor="cost-reason">
        <Textarea
          id="cost-reason"
          required
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={disabled}>
          Cancelar
        </Button>
        <Button type="submit" disabled={disabled}>
          Guardar corrección
        </Button>
      </div>
    </form>
  );
}

function BaselineForm({
  missing,
  disabled,
  onDirtyChange,
  onCancel,
  onSubmit,
}: {
  missing: string[];
  disabled: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSubmit: (input: { reason: string; markNotApplicable: string[] }) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');

  useEffect(() => {
    onDirtyChange(selected.length > 0 || reason !== '');
  }, [selected, reason, onDirtyChange]);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({ reason, markNotApplicable: selected });
      }}
    >
      <p className="text-sm text-navy-400">
        Marque faltantes de recepción que en realidad no aplican a esta unidad. No registra piezas
        presentes ni sustituye una orden de trabajo.
      </p>
      {missing.map((name) => (
        <label key={name} className="flex items-center gap-2 text-sm text-navy">
          <input
            type="checkbox"
            checked={selected.includes(name)}
            onChange={(event) => {
              setSelected((current) =>
                event.target.checked
                  ? [...current, name]
                  : current.filter((entry) => entry !== name),
              );
            }}
          />
          {name} → no aplica
        </label>
      ))}
      <Field label="Motivo" htmlFor="baseline-reason">
        <Textarea
          id="baseline-reason"
          required
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={disabled}>
          Cancelar
        </Button>
        <Button type="submit" disabled={disabled}>
          Confirmar corrección
        </Button>
      </div>
    </form>
  );
}

function WorkOrderForm({
  pieceId,
  relationship,
  disabled,
  onDirtyChange,
  onCancel,
  onSubmit,
}: {
  pieceId: string;
  relationship: ItemDetailView['physicalRelationship'];
  disabled: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSubmit: (input: {
    type: 'DISMANTLING' | 'INSTALLATION';
    destinationParentId?: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const defaultType = relationship === 'INSTALLED' ? 'DISMANTLING' : 'INSTALLATION';
  const [type, setType] = useState<'DISMANTLING' | 'INSTALLATION'>(defaultType);
  const [destinationParentId, setDestinationParentId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    onDirtyChange(
      isFormDirty(
        { type, destinationParentId, notes },
        { type: defaultType, destinationParentId: '', notes: '' },
      ),
    );
  }, [type, destinationParentId, notes, defaultType, onDirtyChange]);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          type,
          destinationParentId: destinationParentId.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }}
    >
      <p className="text-sm text-navy-400">
        La orden de trabajo queda pendiente. El {UX_TERMS.dismantling.toLowerCase()} no mueve la
        jerarquía hasta que el mecánico la complete. Pieza: {pieceId}
      </p>
      <Field label="Tipo" htmlFor="wo-type">
        <Select
          id="wo-type"
          value={type}
          onChange={(event) => setType(event.target.value as 'DISMANTLING' | 'INSTALLATION')}
        >
          <option value="DISMANTLING">{UX_TERMS.dismantling}</option>
          <option value="INSTALLATION">Instalación</option>
        </Select>
      </Field>
      {type === 'INSTALLATION' && (
        <Field label="Padre destino" htmlFor="wo-dest">
          <Input
            id="wo-dest"
            required
            placeholder="MOT-002"
            value={destinationParentId}
            onChange={(event) => setDestinationParentId(event.target.value)}
          />
        </Field>
      )}
      <Field label="Notas" htmlFor="wo-notes">
        <Textarea
          id="wo-notes"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={disabled}>
          Cancelar
        </Button>
        <Button type="submit" disabled={disabled}>
          Crear orden de trabajo
        </Button>
      </div>
    </form>
  );
}

function PresentChildForm({
  expectedComponentName,
  categoryId,
  categories,
  disabled,
  error,
  onCancel,
  onSubmit,
}: {
  expectedComponentName: string;
  categoryId: string;
  categories: Category[];
  disabled: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (item: RegisterItemInput, baseline?: AssemblyBaselineEntry[]) => Promise<void>;
}) {
  const [name, setName] = useState(expectedComponentName);
  const [condition, setCondition] = useState<ItemCondition>('USED');
  const category = categories.find((entry) => entry.id === categoryId);
  const [entries, setEntries] = useState<AssemblyBaselineEntry[]>(() =>
    (category?.expectedComponents ?? []).map((expectedName) => ({
      expectedComponentName: expectedName,
      status: 'MISSING',
    })),
  );
  const initialEntries = (category?.expectedComponents ?? []).map((expectedName) => ({
    expectedComponentName: expectedName,
    status: 'MISSING' as const,
  }));

  return (
    <GuardedModal
      open
      title={`Registrar ${expectedComponentName} presente`}
      onClose={onCancel}
      hasUnsavedChanges={isFormDirty(
        { name, condition, entries },
        { name: expectedComponentName, condition: 'USED', entries: initialEntries },
      )}
      isBusy={disabled}
    >
      {({ requestClose }) => (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(
              {
                name,
                categoryId,
                condition,
              },
              category?.isAssembly ? entries : undefined,
            );
          }}
        >
          {error && (
            <Info tone="error" title="No se pudo registrar">
              {error}
            </Info>
          )}
          <p className="text-sm text-navy-400">
            Crea la pieza en inventario y la instala en este ensamblaje. No es una orden de trabajo:
            corrige la composición de recepción ahora que el catálogo espera esta pieza.
          </p>
          <p className="text-sm text-navy-400">
            Código al guardar:{' '}
            <span className="font-mono text-navy">{category?.codePrefix ?? '—'}</span>
          </p>
          <Field label="Nombre" htmlFor="present-name">
            <Input
              id="present-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Condición" htmlFor="present-condition">
            <Select
              id="present-condition"
              value={condition}
              onChange={(event) => setCondition(event.target.value as ItemCondition)}
            >
              <option value="USED">Usado</option>
              <option value="NEW">Nuevo</option>
              <option value="REMANUFACTURED">Remanufacturado</option>
            </Select>
          </Field>
          {category?.isAssembly && (
            <div className="border-t border-navy-100 pt-3">
              <BaselineChecklist
                expectedComponents={category.expectedComponents ?? []}
                categories={categories}
                entries={entries}
                onChange={setEntries}
                path={`catalog-review.${expectedComponentName}`}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={requestClose} disabled={disabled}>
              Cancelar
            </Button>
            <Button type="submit" disabled={disabled || !categoryId}>
              Registrar en el árbol
            </Button>
          </div>
        </form>
      )}
    </GuardedModal>
  );
}
