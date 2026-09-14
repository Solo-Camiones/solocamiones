import { useEffect, useState, type FormEvent } from 'react';

import type { InProgressCancelDecision, LinkedWorkOrderView } from '../../api/contracts/sales';
import type { PaymentMethod } from '../../api/contracts/entities';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { UX_TERMS } from '../../shared/copy/glossary';
import {
  Button,
  Field,
  GuardedModal,
  Info,
  Select,
  Textarea,
  money,
  isFormDirty,
} from '../../shared/ui';
import { PAYMENT_METHOD_LABELS } from './labels';

export type CancelInvoiceModalProps = {
  open: boolean;
  paid: number;
  currency: 'DOP' | 'USD';
  workOrders: LinkedWorkOrderView[];
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: {
    reason: string;
    refundMethod?: PaymentMethod;
    idempotencyKey: string;
    inProgressDecision?: InProgressCancelDecision;
  }) => void;
};

const METHODS: PaymentMethod[] = ['CASH', 'TRANSFER', 'CHECK'];

export function CancelInvoiceModal({
  open,
  paid,
  currency,
  workOrders,
  isSaving,
  error,
  onClose,
  onSubmit,
}: CancelInvoiceModalProps) {
  const { workOrders: workOrdersEnabled } = useAppCapabilities();
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('CASH');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [inProgressDecision, setInProgressDecision] = useState<InProgressCancelDecision>('STOP');
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const fields = { reason, refundMethod, inProgressDecision };
  const [baseline, setBaseline] = useState(fields);
  const showWorkOrders = workOrdersEnabled && workOrders.length > 0;
  const hasInProgress = showWorkOrders && workOrders.some((order) => order.status === 'IN_PROGRESS');

  useEffect(() => {
    if (open) {
      const next = {
        reason: '',
        refundMethod: 'CASH' as PaymentMethod,
        inProgressDecision: 'STOP' as InProgressCancelDecision,
      };
      setReason(next.reason);
      setRefundMethod(next.refundMethod);
      setIdempotencyKey(`cancel-${Date.now()}`);
      setInProgressDecision(next.inProgressDecision);
      setAwaitingConfirm(false);
      setBaseline(next);
    }
  }, [open, paid]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!awaitingConfirm) {
      setAwaitingConfirm(true);
      return;
    }
    onSubmit({
      reason,
      refundMethod: paid > 0 ? refundMethod : undefined,
      idempotencyKey,
      inProgressDecision: hasInProgress ? inProgressDecision : undefined,
    });
  }

  return (
    <GuardedModal
      open={open}
      title={awaitingConfirm ? 'Confirmar cancelación' : 'Cancelar factura'}
      onClose={onClose}
      hasUnsavedChanges={isFormDirty(fields, baseline)}
      isBusy={isSaving}
    >
      {({ requestClose }) => (
        <form onSubmit={handleSubmit} className="space-y-4">
          {awaitingConfirm ? (
            <>
              <Info tone="warning" title="La factura quedará cancelada">
                Esta operación no se puede deshacer. Se conserva el historial y, si hubo dinero
                recibido, se registra el reembolso neto total.
              </Info>
              {error && (
                <Info tone="error" title="No se pudo cancelar">
                  {error}
                </Info>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAwaitingConfirm(false)}
                  disabled={isSaving}
                >
                  Volver
                </Button>
                <Button type="submit" variant="danger" disabled={isSaving}>
                  {isSaving ? 'Cancelando…' : 'Confirmar cancelación'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Info tone="warning" title="La cancelación no borra el documento">
                Se conserva el historial de la factura y de sus pagos. Si hubo dinero recibido, esta
                operación registra el reembolso neto total.
              </Info>

              {showWorkOrders && (
                <ul className="space-y-1 rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-sm text-navy">
                  {workOrders.map((order) => (
                    <li key={order.id}>
                      {order.id} · {order.pieceName} ·{' '}
                      {order.status === 'PENDING'
                        ? 'Pendiente (se cancela la orden)'
                        : order.status === 'IN_PROGRESS'
                          ? 'En proceso'
                          : order.status === 'COMPLETED'
                            ? 'Completada (queda independiente)'
                            : order.status}
                    </li>
                  ))}
                </ul>
              )}

              {hasInProgress && (
                <Field label={`${UX_TERMS.dismantling} en proceso`} htmlFor="cancel-wo-decision">
                  <Select
                    id="cancel-wo-decision"
                    value={inProgressDecision}
                    onChange={(event) =>
                      setInProgressDecision(event.target.value as InProgressCancelDecision)
                    }
                  >
                    <option value="STOP">Detener trabajo y cancelar la orden</option>
                    <option value="CONTINUE">{`Cancelar la venta y continuar el ${UX_TERMS.dismantling.toLowerCase()}`}</option>
                  </Select>
                </Field>
              )}

              <Field label="Motivo" htmlFor="cancel-reason">
                <Textarea
                  id="cancel-reason"
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  autoFocus
                />
              </Field>

              {paid > 0 && (
                <>
                  <Field
                    label="Reembolso neto"
                    htmlFor="cancel-refund-method"
                    hint="El monto lo calcula el sistema. Solo se elige el método."
                  >
                    <p className="font-mono text-sm text-navy">{money(paid, currency)}</p>
                  </Field>
                  <Field label="Método de reembolso" htmlFor="cancel-refund-method">
                    <Select
                      id="cancel-refund-method"
                      value={refundMethod}
                      onChange={(event) => setRefundMethod(event.target.value as PaymentMethod)}
                      required
                    >
                      {METHODS.map((entry) => (
                        <option key={entry} value={entry}>
                          {PAYMENT_METHOD_LABELS[entry]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              )}

              {error && (
                <Info tone="error" title="No se pudo cancelar">
                  {error}
                </Info>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={requestClose} disabled={isSaving}>
                  Cerrar
                </Button>
                <Button type="submit" variant="danger" disabled={isSaving}>
                  Cancelar factura
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </GuardedModal>
  );
}
