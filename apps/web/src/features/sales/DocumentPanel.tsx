import { currencyLabel, Field, Info, SelectMenu } from '../../shared/ui';
import type { Currency } from '../../api/contracts/entities';
import type { PosDraftView } from '../../api/contracts/sales';

type DocumentPanelProps = {
  draft: PosDraftView;
  readOnly: boolean;
  isMutating: boolean;
  error: string | null;
  onCustomerChange: (customerId: string) => void;
  onCurrencyChange: (currency: Currency) => void;
  onFiscalChange: (fiscal: boolean) => void;
};

export function DocumentPanel({
  draft,
  readOnly,
  isMutating,
  error,
  onCustomerChange,
  onCurrencyChange,
  onFiscalChange,
}: DocumentPanelProps) {
  const fiscalLocked = draft.customerIsDefault || !draft.customerRnc;
  const customerOptions = draft.customers.map((customer) => ({
    value: customer.id,
    label: customer.isDefault ? `${customer.name} (predeterminado)` : customer.name,
    description: customer.rnc,
  }));

  return (
    <section className="flex flex-col gap-4">
      {error && (
        <Info tone="error" title="No se pudo actualizar el documento">
          {error}
        </Info>
      )}
      <Field htmlFor="pos-customer" label="Cliente">
        <SelectMenu
          id="pos-customer"
          data-pos-field="customer"
          value={draft.customerId}
          disabled={readOnly || isMutating}
          searchable
          searchPlaceholder="Buscar cliente"
          emptyMessage="Ningún cliente coincide"
          options={customerOptions}
          onChange={onCustomerChange}
        />
      </Field>
      <Field htmlFor="pos-currency" label="Moneda">
        <SelectMenu
          id="pos-currency"
          data-pos-field="currency"
          value={draft.currency}
          disabled={readOnly || isMutating}
          options={[
            { value: 'DOP', label: currencyLabel('DOP') },
            { value: 'USD', label: currencyLabel('USD') },
          ]}
          onChange={(next) => onCurrencyChange(next as Currency)}
        />
      </Field>
      <label className="flex items-start gap-2 text-sm text-navy">
        <input
          id="pos-fiscal"
          data-pos-field="fiscal"
          type="checkbox"
          className="mt-1"
          checked={draft.fiscal}
          disabled={readOnly || isMutating || (fiscalLocked && !draft.fiscal)}
          onChange={(event) => onFiscalChange(event.target.checked)}
        />
        <span>
          <span className="font-medium">Factura con comprobante fiscal</span>
          <span className="mt-0.5 block text-xs text-navy-400">
            Activa el ITBIS (18% incluido) en las líneas gravadas. Requiere cliente con RNC o cédula.
          </span>
        </span>
      </label>
    </section>
  );
}
