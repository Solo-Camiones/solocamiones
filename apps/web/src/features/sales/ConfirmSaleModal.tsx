import { useEffect, useId, useRef, useState } from 'react';

import type { PaymentMethod } from '../../api/contracts/entities';
import type { ConfirmInvoicePayment, PosDraftView } from '../../api/contracts/sales';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { UX_TERMS } from '../../shared/copy/glossary';
import {
  Button,
  Field,
  GuardedModal,
  Info,
  Input,
  ReviewSummary,
  Select,
  currencyLabel,
  isFormDirty,
  money,
} from '../../shared/ui';
import { LINE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from './labels';

const METHODS: PaymentMethod[] = ['CASH', 'TRANSFER', 'CHECK'];
const CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE =
  'A Cliente contado no se le puede vender a crédito';

type ConfirmSaleModalProps = {
  open: boolean;
  draft: PosDraftView;
  isConfirming: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (payment?: ConfirmInvoicePayment) => void;
};

function amountMatchesGross(amount: string, gross: number): boolean {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  return Math.round(parsed * 100) === Math.round(gross * 100);
}

export function ConfirmSaleModal({
  open,
  draft,
  isConfirming,
  error,
  onClose,
  onConfirm,
}: ConfirmSaleModalProps) {
  const capabilities = useAppCapabilities();
  const amountId = useId();
  const includeId = useId();
  const installed = draft.lines.filter((line) => line.installed);
  const cashCustomerRequiresFullPayment = draft.customerIsDefault;
  const [includeInitialPayment, setIncludeInitialPayment] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const fields = { includeInitialPayment, amount, method, reference };
  const [baseline, setBaseline] = useState(fields);
  const submitLock = useRef(false);

  useEffect(() => {
    if (open) {
      const requiresFullPayment = draft.customerIsDefault;
      const next = {
        includeInitialPayment: requiresFullPayment,
        amount: requiresFullPayment ? draft.totals.gross.toFixed(2) : '',
        method: 'CASH' as PaymentMethod,
        reference: '',
      };
      setIncludeInitialPayment(next.includeInitialPayment);
      setAmount(next.amount);
      setMethod(next.method);
      setReference(next.reference);
      setBaseline(next);
      setLocalError(null);
      submitLock.current = false;
    }
  }, [open, draft.customerIsDefault, draft.totals.gross]);

  useEffect(() => {
    if (!isConfirming) {
      submitLock.current = false;
    }
  }, [isConfirming]);

  function handleConfirm() {
    if (isConfirming || submitLock.current || draft.blockers.length > 0) {
      return;
    }
    submitLock.current = true;

    if (cashCustomerRequiresFullPayment) {
      const trimmed = amount.trim() || draft.totals.gross.toFixed(2);
      if (!amountMatchesGross(trimmed, draft.totals.gross)) {
        setLocalError(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);
        submitLock.current = false;
        return;
      }
      onConfirm({
        amount: Number(trimmed),
        method,
        reference: reference.trim() || undefined,
      });
      return;
    }

    const trimmed = amount.trim();
    if (!capabilities.payments || !includeInitialPayment || trimmed === '') {
      onConfirm();
      return;
    }

    onConfirm({
      amount: Number(trimmed),
      method,
      reference: reference.trim() || undefined,
    });
  }

  const displayedError = localError ?? error;
  const showPaymentFields = capabilities.payments || cashCustomerRequiresFullPayment;

  return (
    <GuardedModal
      open={open}
      title="Confirmar venta"
      onClose={onClose}
      hasUnsavedChanges={isFormDirty(fields, baseline)}
      isBusy={isConfirming}
    >
      {({ requestClose }) => (
      <div className="flex flex-col gap-4 text-sm text-navy">
        {displayedError && (
          <Info tone="error" title="No se pudo confirmar">
            {displayedError}
          </Info>
        )}
        <p className="font-medium">Revisa los datos antes de emitir la factura.</p>
        <ReviewSummary
          rows={[
            { label: 'Cliente', value: draft.customerName },
            { label: 'Identificación fiscal / cédula', value: draft.customerRnc ?? '' },
            { label: 'Moneda', value: currencyLabel(draft.currency) },
            { label: 'Comprobante fiscal', value: draft.fiscal ? 'Sí' : 'No' },
            { label: 'Aplicar ITBIS', value: draft.applyItbis ? 'Sí' : 'No' },
            { label: 'Total', value: money(draft.totals.gross, draft.currency) },
            { label: 'ITBIS', value: money(draft.totals.itbis, draft.currency) },
          ]}
        >
          <div className="space-y-2">
            <p className="text-navy-400">Líneas</p>
            {draft.lines.length === 0 ? (
              <p className="font-medium">—</p>
            ) : (
              <ul className="space-y-1">
                {draft.lines.map((line) => (
                  <li key={line.id}>
                    {line.description} · {LINE_TYPE_LABELS[line.type]} · cant. {line.quantity} ·{' '}
                    {money(line.gross, draft.currency)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ReviewSummary>
        {capabilities.workOrders && installed.length > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            Hay {installed.length} pieza(s) instalada(s). Al confirmar quedarán vendidas e
            instaladas y se abrirá una orden de {UX_TERMS.dismantling.toLowerCase()} pendiente.
          </p>
        )}
        {draft.blockers.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-red-700">
            {draft.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}

        {showPaymentFields && (
          <>
            <label htmlFor={includeId} className="flex items-center gap-2 font-medium">
              <input
                id={includeId}
                type="checkbox"
                checked={cashCustomerRequiresFullPayment || includeInitialPayment}
                onChange={(event) => setIncludeInitialPayment(event.target.checked)}
                disabled={isConfirming || cashCustomerRequiresFullPayment}
              />
              Pago inicial
            </label>
            <p className="text-xs text-navy-400">
              {cashCustomerRequiresFullPayment
                ? 'Cliente contado debe pagarse completo al confirmar. No se vende a crédito.'
                : 'Sin marcar o sin monto, la venta queda a crédito (sin pago).'}
            </p>
            {(cashCustomerRequiresFullPayment || includeInitialPayment) && (
              <div className="space-y-3">
                <Field
                  label="Monto"
                  htmlFor={amountId}
                  hint={`Hasta ${money(draft.totals.gross, draft.currency)}`}
                >
                  <Input
                    id={amountId}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setLocalError(null);
                    }}
                    autoFocus
                  />
                </Field>
                <Field label="Método" htmlFor="confirm-pay-method">
                  <Select
                    id="confirm-pay-method"
                    value={method}
                    onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                  >
                    {METHODS.map((entry) => (
                      <option key={entry} value={entry}>
                        {PAYMENT_METHOD_LABELS[entry]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Referencia" htmlFor="confirm-pay-ref" hint="Opcional">
                  <Input
                    id="confirm-pay-ref"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </Field>
              </div>
            )}
          </>
        )}

        {showPaymentFields && (
          <ReviewSummary
            rows={
              cashCustomerRequiresFullPayment || includeInitialPayment
                ? [
                    {
                      label: 'Pago',
                      value:
                        amount.trim() && Number.isFinite(Number(amount))
                          ? money(Number(amount), draft.currency)
                          : cashCustomerRequiresFullPayment
                            ? money(draft.totals.gross, draft.currency)
                            : '',
                    },
                    { label: 'Método', value: PAYMENT_METHOD_LABELS[method] },
                    { label: 'Referencia', value: reference },
                  ]
                : [{ label: 'Pago', value: 'A crédito (sin pago inicial)' }]
            }
          />
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={requestClose} disabled={isConfirming}>
            Volver
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isConfirming || draft.blockers.length > 0}
            busy={isConfirming}
          >
            {isConfirming ? 'Confirmando…' : 'Confirmar venta'}
          </Button>
        </div>
      </div>
      )}
    </GuardedModal>
  );
}
