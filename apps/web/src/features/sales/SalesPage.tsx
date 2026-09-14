import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import type { SalesListTab } from '../../api/contracts/sales';
import { parseListPage, setListPageParam } from '../../api/contracts/pagination';
import { Button, Chip, Info, PaginationBar, SearchInput, Skeleton, toPageLoadMessage } from '../../shared/ui';
import { PageHeader } from '../../shared/layout/PageHeader';
import { TabBar } from '../../shared/layout/TabBar';
import { SalesTable } from './SalesTable';
import {
  parseSalesListTab,
  parseSalesUrlFilters,
  salesUrlFiltersActive,
  useSalesList,
} from './useSalesList';

const TABS: { id: SalesListTab; label: string }[] = [
  { id: 'ALL', label: 'Todas' },
  { id: 'DRAFT', label: 'Borrador' },
  { id: 'COMPLETED', label: 'Completada' },
  { id: 'CANCELLED', label: 'Cancelada' },
];

function kpiFilterLabels(filters: ReturnType<typeof parseSalesUrlFilters>): string[] {
  const labels: string[] = [];
  if (filters.today) {
    labels.push('Facturas de hoy');
  }
  if (filters.outstanding) {
    labels.push('Saldo pendiente');
  }
  if (filters.payments) {
    labels.push('Historial de cobros');
  }
  return labels;
}

export function SalesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const tab = parseSalesListTab(searchParams.get('tab')) ?? 'ALL';
  const page = parseListPage(searchParams.get('page'));
  const kpiFilters = parseSalesUrlFilters(searchParams);
  const { result } = useSalesList(tab, page, query, kpiFilters);
  const navigate = useNavigate();
  const visibleRows = result.status === 'ready' ? result.rows : [];

  function handleTabChange(next: SalesListTab) {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (next === 'ALL') {
          nextParams.delete('tab');
        } else {
          nextParams.set('tab', next);
        }
        setListPageParam(nextParams, 1);
        return nextParams;
      },
      { replace: true },
    );
  }

  function clearKpiFilters() {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        nextParams.delete('today');
        nextParams.delete('outstanding');
        nextParams.delete('payments');
        setListPageParam(nextParams, 1);
        return nextParams;
      },
      { replace: true },
    );
  }

  if (result.status === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar las ventas">
        {toPageLoadMessage(result.error.message, 'No pudimos cargar las ventas.')}
      </Info>
    );
  }

  const activeKpiLabels = kpiFilterLabels(kpiFilters);
  const hasKpiFilter = salesUrlFiltersActive(kpiFilters);

  function goToPage(nextPage: number) {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        setListPageParam(nextParams, nextPage);
        return nextParams;
      },
      { replace: true },
    );
  }

  return (
    <>
      <PageHeader
        title="Ventas y Facturas"
        description="Facturas, pagos y cancelación."
        actions={
          <Button onClick={() => navigate('/sales/draft/new')}>Nuevo borrador</Button>
        }
      />

      <div className="mb-6 max-w-md">
        <SearchInput
          id="sales-search"
          label="Buscar por número o cliente"
          placeholder="FAC-000098, nombre del cliente…"
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

      {hasKpiFilter && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {activeKpiLabels.map((label) => (
            <Chip key={label} tone="brand">
              {label}
            </Chip>
          ))}
          <Button variant="ghost" size="sm" onClick={clearKpiFilters}>
            Quitar filtro
          </Button>
        </div>
      )}

      <TabBar tabs={TABS} value={tab} onChange={handleTabChange} aria-label="Estado de factura" />

      {result.status === 'loading' ? (
        <Skeleton label="Cargando facturas" />
      ) : (
        <>
          <SalesTable
            rows={visibleRows}
            hasQuery={query.trim().length > 0 || hasKpiFilter}
          />
          <PaginationBar
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            onPageChange={goToPage}
          />
        </>
      )}
    </>
  );
}
