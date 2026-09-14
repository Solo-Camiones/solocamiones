import { useState, type FormEvent } from 'react';

import type {
  CancelWorkOrderInput,
  ReassignWorkOrderInput,
  WorkOrderDetailView,
  WorkOrderMechanicOption,
} from '../../api/contracts/work-orders';
import { Button, Field, GuardedModal, Info, Select, Textarea, isFormDirty } from '../../shared/ui';

export type WOAdminActionsProps = {
  detail: WorkOrderDetailView;
  mechanics: WorkOrderMechanicOption[];
  isMutating: boolean;
  error: string | null;
  onReassign: (input: ReassignWorkOrderInput) => Promise<boolean>;
  onCancel: (input: CancelWorkOrderInput) => Promise<boolean>;
  onClearError: () => void;
};

export function WOAdminActions({
  detail,
  mechanics,
  isMutating,
  error,
  onReassign,
  onCancel,
  onClearError,
}: WOAdminActionsProps) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [mechanicId, setMechanicId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [physicalVerified, setPhysicalVerified] = useState(false);

  const needsPhysicalCheck = detail.status === 'IN_PROGRESS';

  function closeReassign() {
    if (isMutating) {
      return;
    }
    setReassignOpen(false);
    setMechanicId('');
    setReassignReason('');
    onClearError();
  }

  function closeCancel() {
    if (isMutating) {
      return;
    }
    setCancelOpen(false);
    setCancelReason('');
    setPhysicalVerified(false);
    onClearError();
  }

  async function handleReassign(event: FormEvent) {
    event.preventDefault();
    const succeeded = await onReassign({
      workOrderId: detail.id,
      mechanicId,
      reason: reassignReason,
    });
    if (succeeded) {
      setReassignOpen(false);
      setMechanicId('');
      setReassignReason('');
    }
  }

  async function handleCancel(event: FormEvent) {
    event.preventDefault();
    const succeeded = await onCancel({
      workOrderId: detail.id,
      reason: cancelReason,
      physicalVerified: needsPhysicalCheck ? physicalVerified : undefined,
    });
    if (succeeded) {
      setCancelOpen(false);
      setCancelReason('');
      setPhysicalVerified(false);
    }
  }

  if (!detail.actions.canReassign && !detail.actions.canCancel) {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {detail.actions.canReassign && (
          <Button
            variant="secondary"
            onClick={() => {
              onClearError();
              setReassignOpen(true);
            }}
          >
            Reasignar
          </Button>
        )}
        {detail.actions.canCancel && (
          <Button
            variant="danger"
            onClick={() => {
              onClearError();
              setCancelOpen(true);
            }}
          >
            Cancelar orden
          </Button>
        )}
      </div>

      <GuardedModal
        open={reassignOpen}
        title={`Reasignar ${detail.id}`}
        onClose={closeReassign}
        hasUnsavedChanges={isFormDirty(
          { mechanicId, reassignReason },
          { mechanicId: '', reassignReason: '' },
        )}
        isBusy={isMutating}
      >
        {({ requestClose }) => (
        <form className="flex flex-col gap-3" onSubmit={handleReassign}>
          {error && (
            <Info tone="error" title="No se pudo reasignar">
              {error}
            </Info>
          )}
          <Field label="Mecánico" htmlFor="wo-reassign-mechanic">
            <Select
              id="wo-reassign-mechanic"
              required
              searchable
              searchPlaceholder="Buscar mecánico"
              value={mechanicId}
              onChange={(event) => setMechanicId(event.target.value)}
            >
              <option value="">Seleccione un mecánico</option>
              {mechanics.map((mechanic) => (
                <option key={mechanic.id} value={mechanic.id}>
                  {mechanic.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Motivo" htmlFor="wo-reassign-reason">
            <Textarea
              id="wo-reassign-reason"
              required
              rows={3}
              value={reassignReason}
              onChange={(event) => setReassignReason(event.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={requestClose} disabled={isMutating}>
              Cerrar
            </Button>
            <Button type="submit" disabled={isMutating}>
              Confirmar reasignación
            </Button>
          </div>
        </form>
        )}
      </GuardedModal>

      <GuardedModal
        open={cancelOpen}
        title={`Cancelar ${detail.id}`}
        onClose={closeCancel}
        hasUnsavedChanges={isFormDirty(
          { cancelReason, physicalVerified },
          { cancelReason: '', physicalVerified: false },
        )}
        isBusy={isMutating}
      >
        {({ requestClose }) => (
        <form className="flex flex-col gap-3" onSubmit={handleCancel}>
          {error && (
            <Info tone="error" title="No se pudo cancelar">
              {error}
            </Info>
          )}
          <p className="text-sm text-navy-400">
            Cancelar no completa el trabajo físico ni borra la evidencia. Una orden completada no se
            puede cancelar.
          </p>
          <Field label="Motivo" htmlFor="wo-cancel-reason">
            <Textarea
              id="wo-cancel-reason"
              required
              rows={3}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
            />
          </Field>
          {needsPhysicalCheck && (
            <label className="flex items-start gap-2 text-sm text-navy">
              <input
                type="checkbox"
                className="mt-1"
                checked={physicalVerified}
                onChange={(event) => setPhysicalVerified(event.target.checked)}
              />
              Verifiqué el estado físico de la pieza
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={requestClose} disabled={isMutating}>
              Cerrar
            </Button>
            <Button type="submit" variant="danger" disabled={isMutating}>
              Confirmar cancelación
            </Button>
          </div>
        </form>
        )}
      </GuardedModal>
    </>
  );
}
