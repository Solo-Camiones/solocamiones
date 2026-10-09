import { currencyLabel, Field, Info, SelectMenu } from '../../shared/ui';
import { formatFiscalId } from '../../shared/domain/fiscal-id';
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
  onApplyItbisChange: (applyItbis: boolean) => void;
};

export function DocumentPanel({
  draft,
  readOnly,
  isMutating,
  error,
  onCustomerChange,
  onCurrencyChange,
  onFiscalChange,
  onApplyItbisChange,
}: DocumentPanelProps) {
  const fiscalLocked = draft.customerIsDefault || !draft.customerRnc;
  const customerOptions = draft.customers.map((customer) => ({
    value: customer.id,
    label: customer.isDefault ? `${customer.name} (predeterminado)` : customer.name,
    description: customer.rnc ? formatFiscalId(customer.rnc) : undefined,
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
      <label htmlFor="pos-fiscal" className="flex items-start gap-2 text-sm text-navy">
        <input
          id="pos-fiscal"
          data-pos-field="fiscal"
          type="checkbox"
          className="mt-1"
          checked={draft.fiscal}
          disabled={readOnly || isMutating || (fiscalLocked && !draft.fiscal)}
          onChange={(event) => onFiscalChange(event.target.checked)}
        />
        <span className="font-medium">
          Factura con comprobante fiscal
          <span className="mt-0.5 block text-xs font-normal text-navy-400">
            Requiere cliente con RNC o cédula. No calcula ITBIS por sí solo.
          </span>
        </span>
      </label>
      <label htmlFor="pos-apply-itbis" className="flex items-start gap-2 text-sm text-navy">
        <input
          id="pos-apply-itbis"
          data-pos-field="apply-itbis"
          type="checkbox"
          className="mt-1"
          checked={draft.applyItbis}
          disabled={readOnly || isMutating}
          onChange={(event) => onApplyItbisChange(event.target.checked)}
        />
        <span className="font-medium">
          Aplicar ITBIS
          <span className="mt-0.5 block text-xs font-normal text-navy-400">
            Suma 18% sobre el subtotal de las líneas gravadas. Servicios y entrega quedan exentos.
          </span>
        </span>
      </label>
    </section>
  );
}
