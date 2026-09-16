import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { ReceivablesFilters } from '../../api/contracts/sales';
import { parseListPage, setListPageParam } from '../../api/contracts/pagination';
import {
  Button,
  Field,
  Info,
  Input,
  PaginationBar,
  Select,
  Skeleton,
  toPageLoadMessage,
} from '../../shared/ui';
import { PageHeader } from '../../shared/layout/PageHeader';
import {
  isValidReceivablesInvoiceFilter,
  parseReceivablesInvoiceFilter,
  RECEIVABLES_INVOICE_FILTER_ERROR,
} from './invoice-filter';
import { CustomerOutstandingTable, OpenReceivablesTable } from './ReceivablesTables';
import { useReceivables } from './useReceivables';

function optionalParam(value: string | null): string | undefined {
  return value?.trim() || undefined;
}

function uniqueCustomerOptions<T extends { customerId: string }>(customers: T[]): T[] {
  return Array.from(new Map(customers.map((customer) => [customer.customerId, customer])).values());
}

export function ReceivablesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseListPage(searchParams.get('page'));
  const customerId = optionalParam(searchParams.get('customerId'));
  const invoiceParam = optionalParam(searchParams.get('invoice'));
  const invoiceFromUrl = invoiceParam ? parseReceivablesInvoiceFilter(invoiceParam) : undefined;
  const urlInvoiceInvalid = Boolean(invoiceParam && !invoiceFromUrl);
  const filters: ReceivablesFilters = {
    customerId,
    invoice: invoiceFromUrl,
  };
  const [invoiceInput, setInvoiceInput] = useState(invoiceParam ?? '');
  const [submittedInvoiceError, setSubmittedInvoiceError] = useState<string>();
  const result = useReceivables(page, filters);
  const hasAppliedFilters = Boolean(customerId || invoiceFromUrl);
  const hasUrlFilters = Boolean(customerId || invoiceParam);
  const invoiceError =
    submittedInvoiceError ?? (urlInvoiceInvalid ? RECEIVABLES_INVOICE_FILTER_ERROR : undefined);

  useEffect(() => {
    setInvoiceInput(invoiceParam ?? '');
    setSubmittedInvoiceError(undefined);
  }, [invoiceParam]);

  function setFilter(name: keyof ReceivablesFilters, value?: string) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(name, value);
        else next.delete(name);
        setListPageParam(next, 1);
        return next;
      },
      { replace: true },
    );
  }

  function submitInvoice(event: FormEvent) {
    event.preventDefault();
    const trimmed = invoiceInput.trim();
    if (!trimmed) {
      setSubmittedInvoiceError(undefined);
      setFilter('invoice', undefined);
      return;
    }

    if (!isValidReceivablesInvoiceFilter(trimmed)) {
      setSubmittedInvoiceError(RECEIVABLES_INVOICE_FILTER_ERROR);
      return;
    }

    setSubmittedInvoiceError(undefined);
    setFilter('invoice', parseReceivablesInvoiceFilter(trimmed));
  }

  if (result.status === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar cuentas por cobrar">
        {toPageLoadMessage(result.error.message, 'No pudimos cargar las cuentas por cobrar.')}
      </Info>
    );
  }

  if (result.status === 'loading') {
    return <Skeleton label="Cargando cuentas por cobrar" variant="cards" lines={4} />;
  }

  const customerOptions = uniqueCustomerOptions(result.snapshot.customers);
  const showInvoices = result.snapshot.invoices.length > 0 || hasAppliedFilters;

  return (
    <>
      <PageHeader
        title="Cuentas por cobrar"
        description="Saldos abiertos por cliente y moneda."
      />
      <div className="mb-6 grid gap-4 rounded-xl border border-navy-100 bg-white p-4 md:grid-cols-2">
        <Field label="Cliente" htmlFor="receivables-customer">
          <Select
            id="receivables-customer"
            searchable
            searchPlaceholder="Buscar cliente…"
            value={filters.customerId ?? ''}
            onChange={(event) => setFilter('customerId', event.target.value)}
          >
            <option value="">Todos los clientes</option>
            {customerOptions.map((customer) => (
              <option key={customer.customerId} value={customer.customerId}>
                {customer.customerName}
              </option>
            ))}
          </Select>
        </Field>
        <form className="flex items-end gap-2" onSubmit={submitInvoice}>
          <div className="min-w-0 flex-1">
            <Field label="Factura" htmlFor="receivables-invoice" error={invoiceError}>
              <Input
                id="receivables-invoice"
                placeholder="FAC-000123"
                value={invoiceInput}
                onChange={(event) => {
                  setInvoiceInput(event.target.value);
                  setSubmittedInvoiceError(undefined);
                }}
              />
            </Field>
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        {hasUrlFilters ? (
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSearchParams({}, { replace: true })}
            >
              Limpiar filtros
            </Button>
          </div>
        ) : null}
      </div>
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-navy">Resumen de saldos abiertos</h2>
        <CustomerOutstandingTable rows={result.snapshot.customers} hasQuery={hasAppliedFilters} />
      </section>
      {showInvoices && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-navy">Facturas</h2>
          <OpenReceivablesTable rows={result.snapshot.invoices} hasQuery={hasAppliedFilters} />
          <PaginationBar
            page={result.snapshot.page}
            pageSize={result.snapshot.pageSize}
            total={result.snapshot.total}
            onPageChange={(nextPage) => {
              setSearchParams(
                (previous) => {
                  const next = new URLSearchParams(previous);
                  setListPageParam(next, nextPage);
                  return next;
                },
                { replace: true },
              );
            }}
          />
        </section>
      )}
    </>
  );
}
