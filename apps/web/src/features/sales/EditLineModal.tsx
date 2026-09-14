import { useEffect, useState, type FormEvent } from 'react';

import type { LineType } from '../../api/contracts/entities';
import type { CostProvenance, PosDraftView, PosLineView } from '../../api/contracts/sales';
import { UX_TERMS } from '../../shared/copy/glossary';
import { Button, Field, GuardedModal, Info, Input, Select, isFormDirty } from '../../shared/ui';
import { LineNotesField } from './LineNotesField';
import { normalizeLineNotes } from './line-notes';
import { posLinePriceFieldId } from './pos-copy';
import { LINE_TYPE_LABELS } from './labels';
import { posLineQuantityEditable } from './QuantityCell';

const DESCRIPTION_EDITABLE_TYPES: ReadonlySet<LineType> = new Set([
  'GENERIC',
  'EXTERNAL',
  'DELIVERY',
]);
const COST_EDITABLE_TYPES: ReadonlySet<LineType> = new Set(['GENERIC', 'EXTERNAL']);

export function posLineDescriptionEditable(type: LineType): boolean {
  return DESCRIPTION_EDITABLE_TYPES.has(type);
}

export function posLineCostEditable(type: LineType): boolean {
  return COST_EDITABLE_TYPES.has(type);
}

export type PosLineManualPatch = {
  description?: string;
  notes?: string | null;
  quantity?: number;
  unitPrice: number;
  acquisitionCostDop?: number | null;
  costProvenance?: CostProvenance;
};

type EditLineModalProps = {
  open: boolean;
  draft: PosDraftView;
  line: PosLineView | null;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (line: PosLineView, patch: PosLineManualPatch) => Promise<void>;
};

export function EditLineModal({
  open,
  draft,
  line,
  isSaving,
  error,
  onClose,
  onSubmit,
}: EditLineModalProps) {
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0');
  const [cost, setCost] = useState('');
  const [costProvenance, setCostProvenance] = useState<CostProvenance>('UNKNOWN');
  const fields = { description, notes, quantity, unitPrice, cost, costProvenance };
  const [baseline, setBaseline] = useState(fields);

  useEffect(() => {
    if (!open || !line) {
      return;
    }
    const next = {
      description: line.description,
      notes: line.notes ?? '',
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
      cost: line.acquisitionCostDop == null ? '' : String(line.acquisitionCostDop),
      costProvenance: line.costProvenance,
    };
    setDescription(next.description);
    setNotes(next.notes);
    setQuantity(next.quantity);
    setUnitPrice(next.unitPrice);
    setCost(next.cost);
    setCostProvenance(next.costProvenance);
    setBaseline(next);
  }, [open, line]);

  const quantityEditable = line != null && posLineQuantityEditable(line.type);
  const maxQuantity =
    line?.type === 'QTY' && line.qtyProductId
      ? line.quantity +
        (draft.qtyProducts.find((product) => product.id === line.qtyProductId)?.available ?? 0)
      : undefined;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!line || isSaving) {
      return;
    }

    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(unitPrice);
    const parsedCost = cost === '' ? undefined : Number(cost);

    await onSubmit(line, {
      description: posLineDescriptionEditable(line.type) ? description : undefined,
      notes: normalizeLineNotes(notes),
      quantity: quantityEditable ? parsedQuantity : undefined,
      unitPrice: parsedPrice,
      acquisitionCostDop: posLineCostEditable(line.type)
        ? cost === ''
          ? null
          : parsedCost
        : undefined,
      costProvenance: posLineCostEditable(line.type)
        ? cost === ''
          ? 'UNKNOWN'
          : costProvenance
        : undefined,
    });
  }

  return (
    <GuardedModal
      open={open}
      title="Editar línea"
      onClose={onClose}
      size="lg"
      hasUnsavedChanges={isFormDirty(fields, baseline)}
      isBusy={isSaving}
    >
      {({ requestClose }) => (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {error && (
            <Info tone="error" title="No se pudo guardar la línea">
              {error}
            </Info>
          )}

          <Field htmlFor="edit-line-type" label="Tipo de línea">
            <Input
              id="edit-line-type"
              value={line ? LINE_TYPE_LABELS[line.type] : ''}
              readOnly
              disabled
            />
          </Field>

          {line?.type === 'ITEM' && (
            <Field htmlFor="edit-line-item" label={UX_TERMS.piece}>
              <Input
                id="edit-line-item"
                value={line.itemId ? `${line.itemId} · ${line.description}` : line.description}
                readOnly
                disabled
              />
            </Field>
          )}

          {line?.type === 'QTY' && (
            <Field htmlFor="edit-line-qty" label="Producto">
              <Input id="edit-line-qty" value={line.description} readOnly disabled />
            </Field>
          )}

          {line?.type === 'SERVICE' && (
            <Field htmlFor="edit-line-service" label="Servicio">
              <Input id="edit-line-service" value={line.description} readOnly disabled />
            </Field>
          )}

          {line && posLineDescriptionEditable(line.type) && (
            <Field htmlFor="edit-line-description" label="Descripción">
              <Input
                id="edit-line-description"
                value={description}
                required={line.type !== 'DELIVERY'}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          )}

          {quantityEditable && (
            <Field htmlFor="edit-line-quantity" label="Cantidad">
              <Input
                id="edit-line-quantity"
                type="number"
                min={1}
                max={maxQuantity}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
          )}

          {line && posLineCostEditable(line.type) && (
            <>
              <Field htmlFor="edit-line-cost-provenance" label="Origen del costo">
                <Select
                  id="edit-line-cost-provenance"
                  value={costProvenance}
                  onChange={(event) => {
                    const next = event.target.value as CostProvenance;
                    setCostProvenance(next);
                    if (next === 'UNKNOWN') setCost('');
                  }}
                >
                  <option value="UNKNOWN">Desconocido</option>
                  <option value="ACTUAL">Real</option>
                  <option value="ESTIMATED">Estimado</option>
                </Select>
              </Field>
              <Field htmlFor="edit-line-cost" label="Costo de adquisición en pesos (opcional)">
                <Input
                  id="edit-line-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={cost}
                  onChange={(event) => {
                    setCost(event.target.value);
                    if (event.target.value !== '' && costProvenance === 'UNKNOWN') {
                      setCostProvenance('ACTUAL');
                    }
                  }}
                />
              </Field>
            </>
          )}

          {line && (
            <Field
              htmlFor={posLinePriceFieldId(line.id)}
              label={line.type === 'DELIVERY' ? 'Importe (0 = cortesía)' : 'Precio'}
            >
              <Input
                id={posLinePriceFieldId(line.id)}
                aria-label={`Precio de ${line.id}`}
                type="number"
                min={0}
                step="0.01"
                autoFocus={line.pricePending}
                data-autofocus={line.pricePending ? true : undefined}
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
              />
            </Field>
          )}

          <LineNotesField id="edit-line-notes" value={notes} onChange={setNotes} />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={requestClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving || !line}>
              {isSaving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      )}
    </GuardedModal>
  );
}
