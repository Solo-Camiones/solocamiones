import { useEffect, useId, useState, type FormEvent } from 'react';

import type { PaymentMethod } from '../../api/contracts/entities';
import {
  Button,
  Field,
  GuardedModal,
  Info,
  Input,
  Select,
  money,
  isFormDirty,
} from '../../shared/ui';
import { PAYMENT_METHOD_LABELS } from './labels';

const METHODS: PaymentMethod[] = ['CASH', 'TRANSFER', 'CHECK'];
const BUSINESS_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santo_Domingo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export type PayModalProps = {
  open: boolean;
  invoiceId: string;
  currency: 'DOP' | 'USD';
  balance: number;
  confirmedAt?: string;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: {
    amount: number;
    method: PaymentMethod;
    reference?: string;
    effectiveDate: string;
    idempotencyKey: string;
  }) => void;
};

export function PayModal({
  open,
  invoiceId,
  currency,
  balance,
  confirmedAt,
  isSaving,
  error,
  onClose,
  onSubmit,
}: PayModalProps) {
  const amountId = useId();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const fields = { amount, method, reference, effectiveDate };
  const [baseline, setBaseline] = useState(fields);

  useEffect(() => {
    if (open) {
      const next = {
        amount: '',
        method: 'CASH' as PaymentMethod,
        reference: '',
        effectiveDate: BUSINESS_DATE.format(new Date()),
      };
      setAmount(next.amount);
      setMethod(next.method);
      setReference(next.reference);
      setEffectiveDate(next.effectiveDate);
      setIdempotencyKey(`${invoiceId}-${Date.now()}`);
      setBaseline(next);
    }
  }, [open, invoiceId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      amount: Number(amount),
      method,
      reference: reference.trim() || undefined,
      effectiveDate,
      idempotencyKey,
    });
  }

  return (
    <GuardedModal
      open={open}
      title="Registrar pago"
      onClose={onClose}
      hasUnsavedChanges={isFormDirty(fields, baseline)}
      isBusy={isSaving}
    >
      {({ requestClose }) => (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-navy-400">
            Saldo pendiente: <span className="font-mono text-navy">{money(balance, currency)}</span>
          </p>
          <Field label="Monto" htmlFor={amountId}>
            <Input
              id={amountId}
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Método" htmlFor="pay-method">
            <Select
              id="pay-method"
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
          <Field label="Fecha efectiva" htmlFor="pay-date">
            <Input
              id="pay-date"
              type="date"
              min={confirmedAt ? BUSINESS_DATE.format(new Date(confirmedAt)) : undefined}
              max={BUSINESS_DATE.format(new Date())}
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
              required
            />
          </Field>
          <Field label="Referencia" htmlFor="pay-ref" hint="Opcional">
            <Input
              id="pay-ref"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>

          {error && (
            <Info tone="error" title="No se pudo registrar el pago">
              {error}
            </Info>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={requestClose} disabled={isSaving}>
              Cerrar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Registrando…' : 'Confirmar pago'}
            </Button>
          </div>
        </form>
      )}
    </GuardedModal>
  );
}
