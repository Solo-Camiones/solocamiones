import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { CustomerOutstandingRow, SalesListRow } from '../../api/contracts/sales';
import { parseListPage, setListPageParam } from '../../api/contracts/pagination';
import { Info, PaginationBar, SearchInput, Skeleton, toPageLoadMessage } from '../../shared/ui';
import { PageHeader } from '../../shared/layout/PageHeader';
import { CustomerOutstandingTable, OpenReceivablesTable } from './ReceivablesTables';
import { useReceivables } from './useReceivables';

function matchesCustomerName(name: string, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }
  return name.toLowerCase().includes(normalized);
}

export function ReceivablesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseListPage(searchParams.get('page'));
  const [query, setQuery] = useState('');
  const result = useReceivables(page, query);
  const hasQuery = query.trim().length > 0;

  const customers = useMemo((): CustomerOutstandingRow[] => {
    if (result.status !== 'ready') {
      return [];
    }
    return result.snapshot.customers.filter((row) => matchesCustomerName(row.customerName, query));
  }, [query, result]);

  const invoices = useMemo((): SalesListRow[] => {
    if (result.status !== 'ready') {
      return [];
    }
    return result.snapshot.invoices.filter((row) => matchesCustomerName(row.customerName, query));
  }, [query, result]);

  if (result.status === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar cuentas por cobrar">
        {toPageLoadMessage(result.error.message, 'No pudimos cargar los saldos abiertos.')}
      </Info>
    );
  }

  if (result.status === 'loading') {
    return <Skeleton label="Cargando cuentas por cobrar" variant="cards" lines={4} />;
  }

  const showOpenInvoices = result.snapshot.invoices.length > 0 || hasQuery;

  return (
    <>
      <PageHeader
        title="Cuentas por cobrar"
        description="Saldos abiertos por cliente y moneda."
      />
      <div className="mb-6 max-w-md">
        <SearchInput
          id="receivables-customer-search"
          label="Filtrar por nombre del cliente"
          placeholder="Nombre del cliente…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearchParams(
              (prev) => {
                const nextParams = new URLSearchParams(prev);
                setListPageParam(nextParams, 1);
                return nextParams;
              },
              { replace: true },
            );
          }}
        />
      </div>
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-navy">Resumen por cliente</h2>
        <CustomerOutstandingTable rows={customers} hasQuery={hasQuery} />
      </section>
      {showOpenInvoices && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-navy">Facturas abiertas</h2>
          <OpenReceivablesTable rows={invoices} hasQuery={hasQuery} />
          <PaginationBar
            page={result.snapshot.page}
            pageSize={result.snapshot.pageSize}
            total={result.snapshot.total}
            onPageChange={(nextPage) => {
              setSearchParams(
                (prev) => {
                  const nextParams = new URLSearchParams(prev);
                  setListPageParam(nextParams, nextPage);
                  return nextParams;
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
