import { useEffect, useId, useState } from 'react';

import { Button, Field, GuardedModal, Info, isFormDirty } from '../../shared/ui';

type ConvertConduceModalProps = {
  open: boolean;
  conduceNumber?: string;
  customerHasFiscalId: boolean;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (fiscal: boolean) => void | Promise<void>;
};

export function ConvertConduceModal({
  open,
  conduceNumber,
  customerHasFiscalId,
  isSaving,
  error,
  onClose,
  onSubmit,
}: ConvertConduceModalProps) {
  const fiscalId = useId();
  const [fiscal, setFiscal] = useState(false);
  const fields = { fiscal };
  const [baseline, setBaseline] = useState(fields);

  useEffect(() => {
    if (open) {
      const next = { fiscal: false };
      setFiscal(next.fiscal);
      setBaseline(next);
    }
  }, [open]);

  return (
    <GuardedModal
      open={open}
      title="Facturar conduce"
      onClose={onClose}
      hasUnsavedChanges={isFormDirty(fields, baseline)}
      isBusy={isSaving}
    >
      {({ requestClose }) => (
        <div className="flex flex-col gap-4 text-sm text-navy">
          {error && (
            <Info tone="error" title="No se pudo facturar">
              {error}
            </Info>
          )}
          <p className="font-medium">
            Se asignará un número FAC- a {conduceNumber ?? 'este conduce'} sin recalcular importes,
            pagos ni inventario.
          </p>
          <label htmlFor={fiscalId} className="flex items-start gap-2">
            <input
              id={fiscalId}
              type="checkbox"
              checked={fiscal}
              disabled={isSaving || !customerHasFiscalId}
              onChange={(event) => setFiscal(event.target.checked)}
              className="mt-1"
            />
            <span>
              Factura con comprobante fiscal
              {!customerHasFiscalId && (
                <span className="mt-1 block text-xs text-navy-500">
                  El snapshot del cliente no tiene RNC/cédula; solo factura no fiscal.
                </span>
              )}
            </span>
          </label>
          <Field label="NCF" htmlFor={`${fiscalId}-ncf`}>
            <p id={`${fiscalId}-ncf`} className="rounded-lg border border-navy-100 bg-navy-50 px-3 py-2">
              NCF: ______________________
            </p>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={requestClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isSaving}
              busy={isSaving}
              onClick={() => {
                void onSubmit(fiscal);
              }}
            >
              Facturar
            </Button>
          </div>
        </div>
      )}
    </GuardedModal>
  );
}
