import { useEffect, useState, type FormEvent } from 'react';

import type {
  CreateManualWorkOrderInput,
  WorkOrderCreateOptions,
} from '../../api/contracts/work-orders';
import { UX_TERMS } from '../../shared/copy/glossary';
import { WORK_ORDER_TYPE_LABELS } from './labels';
import { Button, Field, GuardedModal, Info, Select, Textarea, isFormDirty } from '../../shared/ui';

export type CreateWorkOrderModalProps = {
  open: boolean;
  options: WorkOrderCreateOptions | null;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: CreateManualWorkOrderInput) => void;
};

export function CreateWorkOrderModal({
  open,
  options,
  isSaving,
  error,
  onClose,
  onSubmit,
}: CreateWorkOrderModalProps) {
  const [type, setType] = useState<CreateManualWorkOrderInput['type']>('DISMANTLING');
  const [pieceId, setPieceId] = useState('');
  const [destinationParentId, setDestinationParentId] = useState('');
  const [notes, setNotes] = useState('');
  const fields = { type, pieceId, destinationParentId, notes };
  const [baseline, setBaseline] = useState(fields);

  const pieces = type === 'DISMANTLING' ? options?.dismantlingPieces : options?.installationPieces;

  useEffect(() => {
    if (!open) {
      return;
    }
    const next = {
      type: 'DISMANTLING' as const,
      pieceId: '',
      destinationParentId: '',
      notes: '',
    };
    setType(next.type);
    setPieceId(next.pieceId);
    setDestinationParentId(next.destinationParentId);
    setNotes(next.notes);
    setBaseline(next);
  }, [open]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      pieceId,
      type,
      destinationParentId: type === 'INSTALLATION' ? destinationParentId : undefined,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <GuardedModal
      open={open}
      title="Crear orden de trabajo"
      onClose={onClose}
      hasUnsavedChanges={isFormDirty(fields, baseline)}
      isBusy={isSaving}
    >
      {({ requestClose }) => (
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        {error && (
          <Info tone="error" title="No se pudo crear la orden de trabajo">
            {error}
          </Info>
        )}
        <p className="text-sm text-navy-400">
          La creación deja la orden pendiente. El {UX_TERMS.dismantling.toLowerCase()} no mueve la
          jerarquía hasta que el mecánico complete el trabajo.
        </p>
        <Field label="Tipo" htmlFor="create-wo-type">
          <Select
            id="create-wo-type"
            value={type}
            onChange={(event) => {
              setType(event.target.value as CreateManualWorkOrderInput['type']);
              setPieceId('');
              setDestinationParentId('');
            }}
          >
            <option value="DISMANTLING">{WORK_ORDER_TYPE_LABELS.DISMANTLING}</option>
            <option value="INSTALLATION">{WORK_ORDER_TYPE_LABELS.INSTALLATION}</option>
          </Select>
        </Field>
        <Field label="Pieza" htmlFor="create-wo-piece">
          <Select
            id="create-wo-piece"
            required
            searchable
            searchPlaceholder="Buscar pieza"
            value={pieceId}
            onChange={(event) => setPieceId(event.target.value)}
          >
            <option value="">Seleccione una pieza</option>
            {(pieces ?? []).map((piece) => (
              <option key={piece.id} value={piece.id}>
                {piece.id} — {piece.name}
              </option>
            ))}
          </Select>
        </Field>
        {type === 'INSTALLATION' && (
          <Field label="Padre destino" htmlFor="create-wo-dest">
            <Select
              id="create-wo-dest"
              required
              searchable
              searchPlaceholder="Buscar ensamblaje"
              value={destinationParentId}
              onChange={(event) => setDestinationParentId(event.target.value)}
            >
              <option value="">Seleccione el ensamblaje destino</option>
              {(options?.destinations ?? []).map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.id} — {destination.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Notas" htmlFor="create-wo-notes">
          <Textarea
            id="create-wo-notes"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={requestClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSaving || !options}>
            Crear orden de trabajo
          </Button>
        </div>
      </form>
      )}
    </GuardedModal>
  );
}
