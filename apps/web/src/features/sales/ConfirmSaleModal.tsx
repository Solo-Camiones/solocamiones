import { useEffect, useId, useRef, useState } from 'react';

import type { PaymentMethod } from '../../api/contracts/entities';
import type { ConfirmInvoicePayment, PosDraftView } from '../../api/contracts/sales';
import { useAuth } from '../auth/useAuth';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { UX_TERMS } from '../../shared/copy/glossary';
import { formatFiscalId } from '../../shared/domain/fiscal-id';
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
const FULL_PAYMENT_REQUIRED_MESSAGE =
  'Los clientes de contado y las facturas en USD deben pagarse completos al confirmar. No se vende a crédito.';
const INITIAL_PAYMENT_REQUIRED_MESSAGE = 'El pago inicial debe ser mayor que cero y no superar el total.';
const SELLER_CREDIT_COLLECTION_MESSAGE =
  'Esta venta a crédito queda pendiente de cobro. El Administrador registra el pago.';

type ConfirmSaleModalProps = {
  open: boolean;
  draft: PosDraftView;
  isConfirming: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (payment?: ConfirmInvoicePayment) => void | Promise<void>;
};

function amountMatchesGross(amount: string, gross: number): boolean {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  return Math.round(parsed * 100) === Math.round(gross * 100);
}

function amountIsWithinGross(amount: number, gross: number): boolean {
  return amount > 0 && Math.round(amount * 100) <= Math.round(gross * 100);
}

export function saleRequiresFullPayment(draft: PosDraftView): boolean {
  return draft.customerType === 'CASH' || draft.currency === 'USD' || draft.customerIsDefault;
}

export function ConfirmSaleModal({
  open,
  draft,
  isConfirming,
  error,
  onClose,
  onConfirm,
}: ConfirmSaleModalProps) {
  const { user } = useAuth();
  const capabilities = useAppCapabilities();
  const amountId = useId();
  const includeId = useId();
  const installed = draft.lines.filter((line) => line.installed);
  const requiresFullPayment = saleRequiresFullPayment(draft);
  const isQuoteConversion = draft.status === 'QUOTE_ISSUED';
  const isAdministrator = user?.role === 'ADMINISTRATOR';
  const isSellerCreditDop =
    user?.role === 'SELLER' &&
    draft.customerType === 'CREDIT' &&
    draft.currency === 'DOP' &&
    !draft.customerIsDefault;
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
  }, [open, requiresFullPayment, draft.totals.gross]);

  useEffect(() => {
    if (!isConfirming) {
      submitLock.current = false;
    }
  }, [isConfirming]);

  async function handleConfirm() {
    if (isConfirming || submitLock.current || draft.blockers.length > 0) {
      return;
    }
    submitLock.current = true;
    setLocalError(null);

    try {
      if (isSellerCreditDop) {
        await onConfirm();
        return;
      }

      if (requiresFullPayment) {
        const trimmed = amount.trim() || draft.totals.gross.toFixed(2);
        if (!amountMatchesGross(trimmed, draft.totals.gross)) {
          setLocalError(FULL_PAYMENT_REQUIRED_MESSAGE);
          return;
        }
        await onConfirm({
          amount: Number(trimmed),
          method,
          reference: reference.trim() || undefined,
        });
        return;
      }

      const mayIncludePayment = isAdministrator && capabilities.payments;
      const trimmed = amount.trim();
      if (!mayIncludePayment || !includeInitialPayment || trimmed === '') {
        await onConfirm();
        return;
      }

      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || !amountIsWithinGross(parsed, draft.totals.gross)) {
        setLocalError(INITIAL_PAYMENT_REQUIRED_MESSAGE);
        return;
      }

      await onConfirm({
        amount: parsed,
        method,
        reference: reference.trim() || undefined,
      });
    } finally {
      // Parent drives isConfirming; unlock here so a failed confirm can be retried
      // even when React batches away a true→false isConfirming transition.
      submitLock.current = false;
    }
  }

  const displayedError = localError ?? error;
  const showPaymentFields =
    !isSellerCreditDop && (requiresFullPayment || (isAdministrator && capabilities.payments));

  return (
    <GuardedModal
      open={open}
      title={isQuoteConversion ? 'Convertir a factura' : 'Confirmar venta'}
      onClose={onClose}
      hasUnsavedChanges={isFormDirty(fields, baseline)}
      isBusy={isConfirming}
    >
      {({ requestClose }) => (
      <div className="flex flex-col gap-4 text-sm text-navy">
        {displayedError && (
          <Info tone="error" title={isQuoteConversion ? 'No se pudo convertir' : 'No se pudo confirmar'}>
            {displayedError}
          </Info>
        )}
        <p className="font-medium">
          {isQuoteConversion
            ? `Revisa los datos antes de convertir ${draft.quoteNumber ?? 'la cotización'} en factura.`
            : 'Revisa los datos antes de emitir la factura.'}
        </p>
        <ReviewSummary
          rows={[
            { label: 'Cliente', value: draft.customerName },
            { label: 'Identificación fiscal / cédula', value: formatFiscalId(draft.customerRnc) },
            { label: 'Moneda', value: currencyLabel(draft.currency) },
            { label: 'Comprobante fiscal', value: draft.fiscal ? 'Sí' : 'No' },
            { label: 'Aplicar ITBIS', value: draft.applyItbis ? 'Sí' : 'No' },
            {
              label: 'Descuento',
              value:
                draft.discountPercent > 0
                  ? `${draft.discountPercent}% (−${money(draft.totals.discount, draft.currency)})`
                  : 'Ninguno',
            },
            ...(draft.quoteNumber ? [{ label: 'Cotización', value: draft.quoteNumber }] : []),
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

        {isSellerCreditDop && (
          <p className="rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-navy">
            {SELLER_CREDIT_COLLECTION_MESSAGE}
          </p>
        )}

        {showPaymentFields && (
          <>
            <label htmlFor={includeId} className="flex items-center gap-2 font-medium">
              <input
                id={includeId}
                type="checkbox"
                checked={requiresFullPayment || includeInitialPayment}
                onChange={(event) => setIncludeInitialPayment(event.target.checked)}
                disabled={isConfirming || requiresFullPayment}
              />
              Pago inicial
            </label>
            <p className="text-xs text-navy-400">
              {requiresFullPayment
                ? 'Los clientes de contado y las facturas en USD deben pagarse completos al confirmar. No se vende a crédito.'
                : 'Sin marcar, la venta queda a crédito (sin pago). Un pago inicial puede ser parcial o total, nunca cero.'}
            </p>
            {(requiresFullPayment || includeInitialPayment) && (
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
                    disabled={isConfirming || requiresFullPayment}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setLocalError(null);
                    }}
                    autoFocus={!requiresFullPayment}
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
              requiresFullPayment || includeInitialPayment
                ? [
                    {
                      label: 'Pago',
                      value:
                        amount.trim() && Number.isFinite(Number(amount))
                          ? money(Number(amount), draft.currency)
                          : requiresFullPayment
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
            {isConfirming
              ? isQuoteConversion
                ? 'Convirtiendo…'
                : 'Confirmando…'
              : isQuoteConversion
                ? 'Convertir a factura'
                : 'Confirmar venta'}
          </Button>
        </div>
      </div>
      )}
    </GuardedModal>
  );
}
