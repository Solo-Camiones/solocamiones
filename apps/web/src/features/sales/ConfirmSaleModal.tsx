import { useEffect, useId, useMemo, useRef, useState } from 'react';

import type { PaymentMethod } from '../../api/contracts/entities';
import type { ConfirmInvoicePayment, IssueConduceInput, PosDraftView } from '../../api/contracts/sales';
import { useAuth } from '../auth/useAuth';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { UX_TERMS } from '../../shared/copy/glossary';
import { businessDateString } from '../../shared/domain/business-date';
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
const CONDUCE_FULL_PAYMENT_REQUIRED_MESSAGE =
  'Este conduce requiere pago completo al emitir (Cliente contado, Vendedor o USD sin excepción Admin).';
const INITIAL_PAYMENT_REQUIRED_MESSAGE = 'El pago inicial debe ser mayor que cero y no superar el total.';
const DUE_DATE_REQUIRED_MESSAGE =
  'Indique la fecha de vencimiento cuando el conduce de contado queda con saldo.';
const SELLER_CREDIT_COLLECTION_MESSAGE =
  'Esta venta a crédito queda pendiente de cobro. El Administrador registra el pago.';
const CONDUCE_NON_FISCAL_MESSAGE =
  'El conduce no es un documento fiscal. La elección de comprobante fiscal se hace al facturar.';

export type ConfirmSaleMode = 'invoice' | 'conduce';

type ConfirmSaleModalProps = {
  open: boolean;
  draft: PosDraftView;
  mode?: ConfirmSaleMode;
  isConfirming: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (input?: IssueConduceInput) => void | Promise<void>;
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

/** SALE-005 / PAY-001: direct invoice confirmation always settles CASH/USD/default in full. */
export function saleRequiresFullPayment(draft: PosDraftView): boolean {
  return draft.customerType === 'CASH' || draft.currency === 'USD' || draft.customerIsDefault;
}

/**
 * CON-002: Admin may leave balance only on named CASH (not default Cliente contado).
 * Seller and default/CREDIT-USD paths still require full settlement.
 */
export function conduceRequiresFullPayment(
  draft: PosDraftView,
  role: 'ADMINISTRATOR' | 'SELLER' | 'MECHANIC' | undefined,
): boolean {
  if (role === 'ADMINISTRATOR' && draft.customerType === 'CASH' && !draft.customerIsDefault) {
    return false;
  }
  return saleRequiresFullPayment(draft);
}

export function ConfirmSaleModal({
  open,
  draft,
  mode = 'invoice',
  isConfirming,
  error,
  onClose,
  onConfirm,
}: ConfirmSaleModalProps) {
  const { user } = useAuth();
  const capabilities = useAppCapabilities();
  const amountId = useId();
  const includeId = useId();
  const dueDateId = useId();
  const installed = draft.lines.filter((line) => line.installed);
  const isConduce = mode === 'conduce';
  const isQuoteConversion = draft.status === 'QUOTE_ISSUED';
  const isAdministrator = user?.role === 'ADMINISTRATOR';
  const requiresFullPayment = isConduce
    ? conduceRequiresFullPayment(draft, user?.role)
    : saleRequiresFullPayment(draft);
  const isSellerCreditDop =
    user?.role === 'SELLER' &&
    draft.customerType === 'CREDIT' &&
    draft.currency === 'DOP' &&
    !draft.customerIsDefault;
  const emissionDay = useMemo(() => businessDateString(new Date()), []);
  const [includeInitialPayment, setIncludeInitialPayment] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const fields = { includeInitialPayment, amount, method, reference, dueDate };
  const [baseline, setBaseline] = useState(fields);
  const submitLock = useRef(false);

  const namedCashAdminBalanceAllowed =
    isConduce && isAdministrator && draft.customerType === 'CASH' && !draft.customerIsDefault;

  useEffect(() => {
    if (open) {
      const next = {
        includeInitialPayment: requiresFullPayment,
        amount: requiresFullPayment ? draft.totals.gross.toFixed(2) : '',
        method: 'CASH' as PaymentMethod,
        reference: '',
        dueDate: '',
      };
      setIncludeInitialPayment(next.includeInitialPayment);
      setAmount(next.amount);
      setMethod(next.method);
      setReference(next.reference);
      setDueDate(next.dueDate);
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

  const parsedAmount = Number(amount.trim());
  const hasPartialOrZeroPayment =
    namedCashAdminBalanceAllowed &&
    (!includeInitialPayment ||
      amount.trim() === '' ||
      (Number.isFinite(parsedAmount) &&
        Math.round(parsedAmount * 100) < Math.round(draft.totals.gross * 100)));
  const showDueDateField = namedCashAdminBalanceAllowed && hasPartialOrZeroPayment;

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

      let payment: ConfirmInvoicePayment | undefined;

      if (requiresFullPayment) {
        const trimmed = amount.trim() || draft.totals.gross.toFixed(2);
        if (!amountMatchesGross(trimmed, draft.totals.gross)) {
          setLocalError(
            isConduce ? CONDUCE_FULL_PAYMENT_REQUIRED_MESSAGE : FULL_PAYMENT_REQUIRED_MESSAGE,
          );
          return;
        }
        payment = {
          amount: Number(trimmed),
          method,
          reference: reference.trim() || undefined,
        };
      } else {
        const mayIncludePayment = isAdministrator && capabilities.payments;
        const trimmed = amount.trim();
        if (mayIncludePayment && includeInitialPayment && trimmed !== '') {
          const parsed = Number(trimmed);
          if (!Number.isFinite(parsed) || !amountIsWithinGross(parsed, draft.totals.gross)) {
            setLocalError(INITIAL_PAYMENT_REQUIRED_MESSAGE);
            return;
          }
          payment = {
            amount: parsed,
            method,
            reference: reference.trim() || undefined,
          };
        }
      }

      const remaining =
        draft.totals.gross - (payment ? Math.round(payment.amount * 100) / 100 : 0);
      const needsDueDate = namedCashAdminBalanceAllowed && remaining > 0;
      if (needsDueDate) {
        if (!dueDate.trim()) {
          setLocalError(DUE_DATE_REQUIRED_MESSAGE);
          return;
        }
        if (dueDate < emissionDay) {
          setLocalError(DUE_DATE_REQUIRED_MESSAGE);
          return;
        }
      }

      const payload =
        payment || (isConduce && needsDueDate)
          ? {
              payment,
              ...(isConduce && needsDueDate ? { dueDate } : {}),
            }
          : undefined;
      if (payload) {
        await onConfirm(payload);
      } else {
        await onConfirm();
      }
    } finally {
      // Parent drives isConfirming; unlock here so a failed confirm can be retried
      // even when React batches away a true→false isConfirming transition.
      submitLock.current = false;
    }
  }

  const displayedError = localError ?? error;
  const showPaymentFields =
    !isSellerCreditDop && (requiresFullPayment || (isAdministrator && capabilities.payments));

  const title = isConduce
    ? isQuoteConversion
      ? 'Convertir a conduce'
      : 'Emitir conduce'
    : isQuoteConversion
      ? 'Convertir a factura'
      : 'Confirmar venta';

  const intro = isConduce
    ? isQuoteConversion
      ? `Revisa los datos antes de convertir ${draft.quoteNumber ?? 'la cotización'} en conduce.`
      : 'Revisa los datos antes de emitir el conduce.'
    : isQuoteConversion
      ? `Revisa los datos antes de convertir ${draft.quoteNumber ?? 'la cotización'} en factura.`
      : 'Revisa los datos antes de emitir la factura.';

  const confirmLabel = isConduce
    ? isQuoteConversion
      ? 'Convertir a conduce'
      : 'Emitir conduce'
    : isQuoteConversion
      ? 'Convertir a factura'
      : 'Confirmar venta';

  return (
    <GuardedModal
      open={open}
      title={title}
      onClose={onClose}
      hasUnsavedChanges={isFormDirty(fields, baseline)}
      isBusy={isConfirming}
    >
      {({ requestClose }) => (
        <div className="flex flex-col gap-4 text-sm text-navy">
          {displayedError && (
            <Info tone="error" title="No se pudo completar">
              {displayedError}
            </Info>
          )}
          <p className="font-medium">{intro}</p>
          {isConduce && (
            <Info tone="warning" title="Documento no fiscal">
              {CONDUCE_NON_FISCAL_MESSAGE}
            </Info>
          )}
          <ReviewSummary
            rows={[
              { label: 'Cliente', value: draft.customerName },
              { label: 'Identificación fiscal / cédula', value: formatFiscalId(draft.customerRnc) },
              { label: 'Moneda', value: currencyLabel(draft.currency) },
              ...(isConduce
                ? [{ label: 'Comprobante fiscal', value: 'No (conduce)' }]
                : [{ label: 'Comprobante fiscal', value: draft.fiscal ? 'Sí' : 'No' }]),
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
              {requiresFullPayment && (
                <p className="rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-navy">
                  {isConduce
                    ? CONDUCE_FULL_PAYMENT_REQUIRED_MESSAGE
                    : FULL_PAYMENT_REQUIRED_MESSAGE}
                </p>
              )}
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
              {(requiresFullPayment || includeInitialPayment) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Monto" htmlFor={amountId}>
                    <Input
                      id={amountId}
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      disabled={isConfirming || requiresFullPayment}
                    />
                  </Field>
                  <Field label="Método" htmlFor={`${amountId}-method`}>
                    <Select
                      id={`${amountId}-method`}
                      value={method}
                      onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                      disabled={isConfirming}
                    >
                      {METHODS.map((entry) => (
                        <option key={entry} value={entry}>
                          {PAYMENT_METHOD_LABELS[entry]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Referencia (opcional)" htmlFor={`${amountId}-ref`}>
                    <Input
                      id={`${amountId}-ref`}
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      disabled={isConfirming}
                    />
                  </Field>
                </div>
              )}
            </>
          )}

          {showDueDateField && (
            <Field label="Fecha de vencimiento" htmlFor={dueDateId}>
              <Input
                id={dueDateId}
                type="date"
                min={emissionDay}
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={isConfirming}
              />
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={requestClose} disabled={isConfirming}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isConfirming || draft.blockers.length > 0}
              busy={isConfirming}
              onClick={() => {
                void handleConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </GuardedModal>
  );
}
