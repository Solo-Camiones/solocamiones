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
  Input,
  Select,
  Textarea,
  money,
  isFormDirty,
} from '../../shared/ui';
import { PAYMENT_METHOD_LABELS } from './labels';

export type CancelInvoiceModalProps = {
  open: boolean;
  /** Net collected (paid − refunded). Default refund amount when opening. */
  paid: number;
  currency: 'DOP' | 'USD';
  documentLabel?: string;
  workOrders: LinkedWorkOrderView[];
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: {
    reason: string;
    refundAmount?: number;
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
  documentLabel = 'factura',
  workOrders,
  isSaving,
  error,
  onClose,
  onSubmit,
}: CancelInvoiceModalProps) {
  const { workOrders: workOrdersEnabled } = useAppCapabilities();
  const [reason, setReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('CASH');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [inProgressDecision, setInProgressDecision] = useState<InProgressCancelDecision>('STOP');
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fields = { reason, refundAmount, refundMethod, inProgressDecision };
  const [baseline, setBaseline] = useState(fields);
  const showWorkOrders = workOrdersEnabled && workOrders.length > 0;
  const hasInProgress = showWorkOrders && workOrders.some((order) => order.status === 'IN_PROGRESS');
  const netCollected = Math.round(paid * 100) / 100;

  useEffect(() => {
    if (open) {
      const next = {
        reason: '',
        refundAmount: netCollected > 0 ? netCollected.toFixed(2) : '0',
        refundMethod: 'CASH' as PaymentMethod,
        inProgressDecision: 'STOP' as InProgressCancelDecision,
      };
      setReason(next.reason);
      setRefundAmount(next.refundAmount);
      setRefundMethod(next.refundMethod);
      setIdempotencyKey(`cancel-${Date.now()}`);
      setInProgressDecision(next.inProgressDecision);
      setAwaitingConfirm(false);
      setLocalError(null);
      setBaseline(next);
    }
  }, [open, netCollected]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    let parsedRefund = 0;
    if (netCollected > 0) {
      parsedRefund = Number(refundAmount.trim());
      if (!Number.isFinite(parsedRefund) || parsedRefund < 0 || parsedRefund > netCollected) {
        setLocalError('El reembolso debe estar entre 0 y el neto cobrado.');
        return;
      }
      parsedRefund = Math.round(parsedRefund * 100) / 100;
    }

    if (!awaitingConfirm) {
      setAwaitingConfirm(true);
      return;
    }

    onSubmit({
      reason,
      refundAmount: netCollected > 0 ? parsedRefund : 0,
      refundMethod: parsedRefund > 0 ? refundMethod : undefined,
      idempotencyKey,
      inProgressDecision: hasInProgress ? inProgressDecision : undefined,
    });
  }

  const displayedError = localError ?? error;
  const titleCase = documentLabel.charAt(0).toUpperCase() + documentLabel.slice(1);

  return (
    <GuardedModal
      open={open}
      title={awaitingConfirm ? 'Confirmar cancelación' : `Cancelar ${documentLabel}`}
      onClose={onClose}
      hasUnsavedChanges={isFormDirty(fields, baseline)}
      isBusy={isSaving}
    >
      {({ requestClose }) => (
        <form onSubmit={handleSubmit} className="space-y-4">
          {awaitingConfirm ? (
            <>
              <Info tone="warning" title={`${titleCase} quedará cancelada`}>
                Esta operación no se puede deshacer. Se conserva el historial y se registra el
                reembolso indicado (0 hasta el neto cobrado).
              </Info>
              {displayedError && (
                <Info tone="error" title="No se pudo cancelar">
                  {displayedError}
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
                Se conserva el historial y de sus pagos. Indique el monto real reembolsado (0 hasta
                el neto cobrado). El saldo pendiente se extingue.
              </Info>

              {showWorkOrders && (
                <ul className="space-y-1 rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-sm text-navy">
                  {workOrders.map((order) => (
                    <li key={order.id}>
                      {order.id} · {order.pieceName} ·{' '}
                      {order.status === 'PENDING'
                        ? 'Pendiente (se cancela la orden)'
                        : order.status === 'IN_PROGRESS'
                          ? 'En progreso'
                          : order.status === 'COMPLETED'
                            ? 'Completada (queda independiente)'
                            : order.status}
                    </li>
                  ))}
                </ul>
              )}

              {hasInProgress && (
                <Field label={`${UX_TERMS.dismantling} en progreso`} htmlFor="cancel-wo-decision">
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

              {netCollected > 0 && (
                <>
                  <Field
                    label="Monto a reembolsar"
                    htmlFor="cancel-refund-amount"
                    hint={`Neto cobrado: ${money(netCollected, currency)}. Puede ser 0.`}
                  >
                    <Input
                      id="cancel-refund-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      max={netCollected}
                      value={refundAmount}
                      onChange={(event) => setRefundAmount(event.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Método de reembolso" htmlFor="cancel-refund-method">
                    <Select
                      id="cancel-refund-method"
                      value={refundMethod}
                      onChange={(event) => setRefundMethod(event.target.value as PaymentMethod)}
                      required={Number(refundAmount) > 0}
                      disabled={Number(refundAmount) <= 0}
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

              {displayedError && (
                <Info tone="error" title="No se pudo cancelar">
                  {displayedError}
                </Info>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={requestClose} disabled={isSaving}>
                  Cerrar
                </Button>
                <Button type="submit" variant="danger" disabled={isSaving}>
                  Cancelar {documentLabel}
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </GuardedModal>
  );
}
