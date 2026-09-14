import { useEffect, useState, type FormEvent } from 'react';

import type { LineType } from '../../api/contracts/entities';
import type { CostProvenance, PosDraftView } from '../../api/contracts/sales';
import { enabledPosLineTypes } from '../../shared/config/capabilities';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { UX_TERMS } from '../../shared/copy/glossary';
import { Button, Field, GuardedModal, Info, Input, Select, isFormDirty } from '../../shared/ui';
import { LineNotesField } from './LineNotesField';
import { posAddLineReservationHint } from './pos-copy';

type AddLineFormFields = {
  type: LineType;
  itemId: string;
  qtyProductId: string;
  serviceId: string;
  description: string;
  notes: string;
  quantity: string;
  unitPrice: string;
  cost: string;
  costProvenance: CostProvenance;
};

type AddLineModalProps = {
  open: boolean;
  draft: PosDraftView;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: {
    type: LineType;
    itemId?: string;
    qtyProductId?: string;
    serviceId?: string;
    description?: string;
    notes?: string;
    quantity?: number;
    unitPrice?: number;
    acquisitionCostDop?: number;
    costProvenance?: CostProvenance;
  }) => Promise<void>;
};

function emptyAddLineFields(
  lineTypes: { value: LineType }[],
  draft: PosDraftView,
): AddLineFormFields {
  return {
    type: lineTypes[0]?.value ?? 'GENERIC',
    itemId: draft.items[0]?.id ?? '',
    qtyProductId: draft.qtyProducts[0]?.id ?? '',
    serviceId: draft.services[0]?.id ?? '',
    description: '',
    notes: '',
    quantity: '1',
    unitPrice: '0',
    cost: '',
    costProvenance: 'UNKNOWN',
  };
}

export function AddLineModal({
  open,
  draft,
  isSaving,
  error,
  onClose,
  onSubmit,
}: AddLineModalProps) {
  const lineTypes = enabledPosLineTypes(useAppCapabilities());
  const [type, setType] = useState<LineType>(lineTypes[0]?.value ?? 'GENERIC');
  const [itemId, setItemId] = useState(draft.items[0]?.id ?? '');
  const [qtyProductId, setQtyProductId] = useState(draft.qtyProducts[0]?.id ?? '');
  const [serviceId, setServiceId] = useState(draft.services[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0');
  const [cost, setCost] = useState('');
  const [costProvenance, setCostProvenance] = useState<CostProvenance>('UNKNOWN');
  const fields: AddLineFormFields = {
    type,
    itemId,
    qtyProductId,
    serviceId,
    description,
    notes,
    quantity,
    unitPrice,
    cost,
    costProvenance,
  };
  const [baseline, setBaseline] = useState(fields);

  useEffect(() => {
    if (!open) {
      return;
    }
    const next = emptyAddLineFields(lineTypes, draft);
    setType(next.type);
    setItemId(next.itemId);
    setQtyProductId(next.qtyProductId);
    setServiceId(next.serviceId);
    setDescription(next.description);
    setNotes(next.notes);
    setQuantity(next.quantity);
    setUnitPrice(next.unitPrice);
    setCost(next.cost);
    setCostProvenance(next.costProvenance);
    setBaseline(next);
    // Reset only when the dialog opens so each add starts blank; later typing is unsaved.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- capture catalog defaults at open
  }, [open]);

  useEffect(() => {
    if (!draft.items.some((item) => item.id === itemId)) {
      setItemId(draft.items[0]?.id ?? '');
    }
  }, [draft.items, itemId]);

  useEffect(() => {
    if (!lineTypes.some((entry) => entry.value === type)) {
      setType(lineTypes[0]?.value ?? 'GENERIC');
    }
  }, [lineTypes, type]);

  const reservationHint = posAddLineReservationHint(type);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSaving || lineTypes.length === 0) {
      return;
    }
    await onSubmit({
      type,
      itemId: type === 'ITEM' ? itemId : undefined,
      qtyProductId: type === 'QTY' ? qtyProductId : undefined,
      serviceId: type === 'SERVICE' ? serviceId : undefined,
      description:
        type === 'GENERIC' || type === 'EXTERNAL' || type === 'DELIVERY' ? description : undefined,
      notes: notes.trim() === '' ? undefined : notes,
      quantity:
        type === 'QTY' || type === 'GENERIC' || type === 'EXTERNAL' ? Number(quantity) : undefined,
      unitPrice: type === 'ITEM' ? undefined : Number(unitPrice),
      acquisitionCostDop:
        (type === 'GENERIC' || type === 'EXTERNAL') && cost !== '' ? Number(cost) : undefined,
      costProvenance:
        type === 'GENERIC' || type === 'EXTERNAL'
          ? cost === ''
            ? 'UNKNOWN'
            : costProvenance
          : undefined,
    });
  }

  return (
    <GuardedModal
      open={open}
      title="Agregar línea"
      onClose={onClose}
      size="lg"
      hasUnsavedChanges={isFormDirty(fields, baseline)}
      isBusy={isSaving}
    >
      {({ requestClose }) => (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {error && (
            <Info tone="error" title="No se pudo agregar la línea">
              {error}
            </Info>
          )}
          <Field htmlFor="line-type" label="Tipo de línea">
            <Select
              id="line-type"
              value={type}
              disabled={lineTypes.length === 0}
              onChange={(event) => setType(event.target.value as LineType)}
            >
              {lineTypes.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>
          {reservationHint && <p className="text-xs text-navy-400">{reservationHint}</p>}

          {type === 'ITEM' && (
            <Field htmlFor="line-item" label={UX_TERMS.piece}>
            <Select
              id="line-item"
              value={itemId}
              searchable
              searchPlaceholder="Buscar pieza"
              onChange={(event) => setItemId(event.target.value)}
            >
                {draft.items.length === 0 && <option value="">No hay piezas elegibles</option>}
                {draft.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id} · {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {type === 'QTY' && (
            <>
              <Field htmlFor="line-qty" label="Producto">
                <Select
                  id="line-qty"
                  value={qtyProductId}
                  searchable
                  searchPlaceholder="Buscar producto"
                  onChange={(event) => setQtyProductId(event.target.value)}
                >
                  {draft.qtyProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.available} disponibles)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field htmlFor="line-qty-amount" label="Cantidad">
                <Input
                  id="line-qty-amount"
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </Field>
            </>
          )}

          {type === 'SERVICE' && (
            <Field htmlFor="line-service" label="Servicio">
              <Select
                id="line-service"
                value={serviceId}
                searchable
                searchPlaceholder="Buscar servicio"
                onChange={(event) => setServiceId(event.target.value)}
              >
                {draft.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {(type === 'GENERIC' || type === 'EXTERNAL' || type === 'DELIVERY') && (
            <Field htmlFor="line-description" label="Descripción">
              <Input
                id="line-description"
                value={description}
                required={type !== 'DELIVERY'}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          )}

          {(type === 'GENERIC' || type === 'EXTERNAL') && (
            <Field htmlFor="line-quantity" label="Cantidad">
              <Input
                id="line-quantity"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
          )}

          {(type === 'GENERIC' || type === 'EXTERNAL') && (
            <>
              <Field htmlFor="line-cost-provenance" label="Origen del costo">
                <Select
                  id="line-cost-provenance"
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
              <Field htmlFor="line-cost" label="Costo de adquisición en pesos (opcional)">
                <Input
                  id="line-cost"
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

          {type !== 'ITEM' && (
            <Field
              htmlFor="line-price"
              label={type === 'DELIVERY' ? 'Importe (0 = cortesía)' : 'Precio'}
            >
              <Input
                id="line-price"
                type="number"
                min={0}
                step="0.01"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
              />
            </Field>
          )}

          <LineNotesField id="line-notes" value={notes} onChange={setNotes} />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={requestClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving || lineTypes.length === 0}>
              {isSaving ? 'Agregando…' : 'Agregar'}
            </Button>
          </div>
        </form>
      )}
    </GuardedModal>
  );
}
