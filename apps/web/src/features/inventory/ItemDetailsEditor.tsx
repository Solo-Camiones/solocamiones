import { useEffect, useState } from 'react';

import type { ItemCondition } from '../../api/contracts/entities';
import type { ItemDetailView, UpdateItemDetailsInput } from '../../api/contracts/inventory';
import { locationDisplay } from '../../shared/copy/glossary';
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
import { CategoryAttributeFields } from './CategoryAttributeFields';
import { ITEM_CONDITIONS } from './item-conditions';
import { PhotoEditor } from './PhotoEditor';

export function ItemDetailsEditor({
  detail,
  isMutating,
  onSave,
}: {
  detail: ItemDetailView;
  isMutating: boolean;
  onSave: (input: Omit<UpdateItemDetailsInput, 'itemId'>) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(detail.name);
  const [brand, setBrand] = useState(detail.brand ?? '');
  const [model, setModel] = useState(detail.model ?? '');
  const [serial, setSerial] = useState(detail.serial ?? '');
  const [partNumber, setPartNumber] = useState(detail.partNumber ?? '');
  const [condition, setCondition] = useState<ItemCondition>(detail.condition);
  const [location, setLocation] = useState(detail.ownLocation ?? '');
  const [notes, setNotes] = useState(detail.notes ?? '');
  const [attributes, setAttributes] = useState(detail.attributes ?? {});
  const [photos, setPhotos] = useState(detail.photos);
  const fields = {
    name,
    brand,
    model,
    serial,
    partNumber,
    condition,
    location,
    notes,
    attributes,
    photos,
  };
  const [baseline, setBaseline] = useState(fields);
  const locationEditable = detail.physicalRelationship === 'INDEPENDENT';
  const category = detail.catalogCategories.find((entry) => entry.id === detail.categoryId);
  const attributeDefinitions = category?.attributes ?? [];

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    const next = {
      name: detail.name,
      brand: detail.brand ?? '',
      model: detail.model ?? '',
      serial: detail.serial ?? '',
      partNumber: detail.partNumber ?? '',
      condition: detail.condition,
      location: detail.ownLocation ?? '',
      notes: detail.notes ?? '',
      attributes: detail.attributes ?? {},
      photos: detail.photos,
    };
    setName(next.name);
    setBrand(next.brand);
    setModel(next.model);
    setSerial(next.serial);
    setPartNumber(next.partNumber);
    setCondition(next.condition);
    setLocation(next.location);
    setNotes(next.notes);
    setAttributes(next.attributes);
    setPhotos(next.photos);
    setBaseline(next);
  }, [open, detail]);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        disabled={isMutating}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Editar datos
      </Button>
      <GuardedModal
        open={open}
        title={`Editar ${detail.id}`}
        onClose={() => {
          setError(null);
          setOpen(false);
        }}
        hasUnsavedChanges={isFormDirty(fields, baseline)}
        isBusy={isMutating}
      >
        {({ requestClose }) => (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void (async () => {
                const message = await onSave({
                  name,
                  brand,
                  model,
                  serial,
                  partNumber,
                  condition,
                  location: locationEditable ? location : undefined,
                  notes,
                  attributes,
                  photos,
                });
                if (message) {
                  setError(message);
                  return;
                }
                setError(null);
                setOpen(false);
              })();
            }}
          >
            {error && (
              <Info tone="error" title="No se pudieron guardar los datos">
                {error}
              </Info>
            )}
            <p className="text-sm text-navy-400">
              Corrige nombre, fotos, ubicación y otros datos descriptivos. El código interno, la
              categoría, el costo y la jerarquía no cambian por aquí y las facturas ya confirmadas
              conservan su descripción original.
            </p>
            <Field label="Nombre" htmlFor="edit-item-name">
              <Input
                id="edit-item-name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Condición" htmlFor="edit-item-condition">
              <Select
                id="edit-item-condition"
                value={condition}
                onChange={(event) => setCondition(event.target.value as ItemCondition)}
              >
                {ITEM_CONDITIONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Marca" htmlFor="edit-item-brand">
                <Input
                  id="edit-item-brand"
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                />
              </Field>
              <Field label="Modelo" htmlFor="edit-item-model">
                <Input
                  id="edit-item-model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
              </Field>
              <Field label="Serial" htmlFor="edit-item-serial">
                <Input
                  id="edit-item-serial"
                  value={serial}
                  onChange={(event) => setSerial(event.target.value)}
                />
              </Field>
              <Field label="Número de parte" htmlFor="edit-item-part">
                <Input
                  id="edit-item-part"
                  value={partNumber}
                  onChange={(event) => setPartNumber(event.target.value)}
                />
              </Field>
            </div>
            {locationEditable ? (
              <Field label="Ubicación" htmlFor="edit-item-location">
                <Input
                  id="edit-item-location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                />
              </Field>
            ) : (
              <p className="text-sm text-navy-400">
                Ubicación efectiva heredada: {locationDisplay(detail.effectiveLocation)}. Edite la
                pieza independiente raíz para mover el conjunto.
              </p>
            )}
            {attributeDefinitions.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-navy">
                  Atributos de {detail.categoryName}
                </p>
                <CategoryAttributeFields
                  definitions={attributeDefinitions}
                  values={attributes}
                  idPrefix="edit-item-attr"
                  onChange={setAttributes}
                />
              </div>
            )}
            <Field label="Notas" htmlFor="edit-item-notes">
              <Textarea
                id="edit-item-notes"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
            <PhotoEditor photos={photos} onChange={setPhotos} inputId="edit-item-photos" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={requestClose} disabled={isMutating}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isMutating}>
                Guardar
              </Button>
            </div>
          </form>
        )}
      </GuardedModal>
    </>
  );
}
