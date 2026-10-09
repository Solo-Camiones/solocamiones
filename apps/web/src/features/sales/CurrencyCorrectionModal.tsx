import { useEffect, useState, type FormEvent } from 'react';

import type { Currency } from '../../api/contracts/entities';
import {
  Button,
  currencyLabel,
  Field,
  GuardedModal,
  Info,
  Select,
  Textarea,
  isFormDirty,
} from '../../shared/ui';

export type CurrencyCorrectionModalProps = {
  open: boolean;
  current: Currency;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { currency: Currency; reason: string }) => void;
};

export function CurrencyCorrectionModal({
  open,
  current,
  isSaving,
  error,
  onClose,
  onSubmit,
}: CurrencyCorrectionModalProps) {
  const nextCurrency: Currency = current === 'DOP' ? 'USD' : 'DOP';
  const [currency, setCurrency] = useState<Currency>(nextCurrency);
  const [reason, setReason] = useState('');
  const fields = { currency, reason };
  const [baseline, setBaseline] = useState(fields);

  useEffect(() => {
    if (open) {
      const next = {
        currency: current === 'DOP' ? ('USD' as Currency) : ('DOP' as Currency),
        reason: '',
      };
      setCurrency(next.currency);
      setReason(next.reason);
      setBaseline(next);
    }
  }, [open, current]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ currency, reason });
  }

  return (
    <GuardedModal
      open={open}
      title="Corregir moneda"
      onClose={onClose}
      hasUnsavedChanges={isFormDirty(fields, baseline)}
      isBusy={isSaving}
    >
      {({ requestClose }) => (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Info tone="warning" title="Los importes no se convierten">
            Solo cambia la etiqueta de moneda. Precios, totales y saldo conservan el mismo número.
          </Info>
          <Field label="Nueva moneda" htmlFor="currency-next">
            <Select
              id="currency-next"
              value={currency}
              onChange={(event) => setCurrency(event.target.value as Currency)}
            >
              <option value="DOP">{currencyLabel('DOP')}</option>
              <option value="USD">{currencyLabel('USD')}</option>
            </Select>
          </Field>
          <Field label="Motivo" htmlFor="currency-reason">
            <Textarea
              id="currency-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              autoFocus
            />
          </Field>
          {error && (
            <Info tone="error" title="No se pudo corregir la moneda">
              {error}
            </Info>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={requestClose} disabled={isSaving}>
              Cerrar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Guardando…' : 'Aplicar corrección'}
            </Button>
          </div>
        </form>
      )}
    </GuardedModal>
  );
}
