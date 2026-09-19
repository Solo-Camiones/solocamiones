import { useEffect, useState, type FormEvent } from 'react';

import { Button, Field, GuardedModal, Info, Input, isFormDirty } from '../../shared/ui';

export type RecordGrossProfitModalProps = {
  open: boolean;
  invoiceNumber: string;
  initialProfitDop?: number | null;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { profitDop: number }) => void;
};

export function RecordGrossProfitModal({
  open,
  invoiceNumber,
  initialProfitDop,
  isSaving,
  error,
  onClose,
  onSubmit,
}: RecordGrossProfitModalProps) {
  const [amount, setAmount] = useState('');
  const [baseline, setBaseline] = useState('');

  useEffect(() => {
    if (open) {
      const next = initialProfitDop != null ? String(initialProfitDop) : '';
      setAmount(next);
      setBaseline(next);
    }
  }, [open, initialProfitDop]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ profitDop: Number(amount) });
  }

  return (
    <GuardedModal
      open={open}
      title="Registrar ganancia bruta"
      onClose={onClose}
      hasUnsavedChanges={isFormDirty(amount, baseline)}
      isBusy={isSaving}
    >
      {({ requestClose }) => (
      <form onSubmit={handleSubmit} className="space-y-4">
        <Info tone="warning" title={`${invoiceNumber} no tiene ganancia calculada`}>
          El costo de adquisición es desconocido. El sistema no inventa un número: usted registra la
          ganancia bruta en pesos según su criterio. Esto no cambia el costo ni la venta.
        </Info>
        <Field
          label="Ganancia bruta en pesos"
          htmlFor="manual-profit-dop"
          hint="Puede ser negativa si la venta fue a pérdida"
        >
          <Input
            id="manual-profit-dop"
            type="number"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
            autoFocus
          />
        </Field>
        {error && (
          <Info tone="error" title="No se pudo registrar la ganancia">
            {error}
          </Info>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={requestClose} disabled={isSaving}>
            Cerrar
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Guardando…' : 'Registrar ganancia'}
          </Button>
        </div>
      </form>
      )}
    </GuardedModal>
  );
}
