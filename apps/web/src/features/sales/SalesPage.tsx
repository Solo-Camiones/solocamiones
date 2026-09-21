import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import type { SalesListFilters, SalesListTab } from '../../api/contracts/sales';
import { parseListPage, setListPageParam } from '../../api/contracts/pagination';
import { useAuth } from '../auth/useAuth';
import {
  Button,
  Chip,
  Field,
  Info,
  Input,
  PaginationBar,
  SearchInput,
  Skeleton,
  LoadingOverlay,
  toPageLoadMessage,
} from '../../shared/ui';
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
  { id: 'QUOTE_DRAFT', label: 'Cot. Borrador' },
  { id: 'QUOTE_ISSUED', label: 'Cot. Emitida' },
  { id: 'CONDUCE', label: 'Conduce' },
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
  const [showDateFilters, setShowDateFilters] = useState(false);
  const { user } = useAuth();
  const tab = parseSalesListTab(searchParams.get('tab')) ?? 'ALL';
  const page = parseListPage(searchParams.get('page'));
  const kpiFilters = parseSalesUrlFilters(searchParams);
  const listFilters: SalesListFilters = {
    dateFrom: searchParams.get('dateFrom') || undefined,
    dateTo: searchParams.get('dateTo') || undefined,
  };
  const [dateFrom, setDateFrom] = useState(listFilters.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(listFilters.dateTo ?? '');
  const [dateError, setDateError] = useState('');
  const { result } = useSalesList(tab, page, query, kpiFilters, listFilters);
  const navigate = useNavigate();
  const visibleRows = result.status === 'ready' ? result.rows : [];
  const showPaymentSettlement = user?.role === 'ADMINISTRATOR';

  useEffect(() => setDateFrom(listFilters.dateFrom ?? ''), [listFilters.dateFrom]);
  useEffect(() => setDateTo(listFilters.dateTo ?? ''), [listFilters.dateTo]);

  function submitDateRange(event: FormEvent) {
    event.preventDefault();
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setDateError('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }
    setDateError('');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (dateFrom) next.set('dateFrom', dateFrom);
        else next.delete('dateFrom');
        if (dateTo) next.set('dateTo', dateTo);
        else next.delete('dateTo');
        setListPageParam(next, 1);
        return next;
      },
      { replace: true },
    );
  }

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
        description="Ventas, cotizaciones, facturas y pagos."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate('/sales/quote/new')}>
              Nueva cotización
            </Button>
            <Button onClick={() => navigate('/sales/draft/new')}>
              Nuevo borrador
            </Button>
          </div>
        }
      />

      <div className="mb-6 rounded-xl border border-navy-100 bg-white p-4">
        {/* Fila principal: búsqueda + toggle de filtros avanzados */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <SearchInput
              id="sales-search"
              label="Buscar por número o cliente"
              placeholder="FAC-000098, COT-000123, cliente…"
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowDateFilters((prev) => !prev)}
            aria-expanded={showDateFilters}
            aria-controls="sales-date-filters"
          >
            {/* Indica si hay fechas activas para que el usuario sepa que hay un filtro aplicado */}
            {listFilters.dateFrom || listFilters.dateTo
              ? 'Fechas activas ✕'
              : showDateFilters
                ? 'Ocultar filtros ↑'
                : 'Filtros avanzados ↓'}
          </Button>
        </div>

        {/* Panel colapsable de filtro por fechas */}
        {showDateFilters && (
          <form
            id="sales-date-filters"
            className="mt-4 flex flex-wrap items-end gap-3 border-t border-navy-100 pt-4"
            onSubmit={submitDateRange}
          >
            <Field label="Fecha desde" htmlFor="sales-date-from">
              <Input
                id="sales-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </Field>
            <Field label="Fecha hasta" htmlFor="sales-date-to" error={dateError || undefined}>
              <Input
                id="sales-date-to"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                aria-invalid={dateError ? true : undefined}
              />
            </Field>
            <Button type="submit" variant="secondary">
              Filtrar
            </Button>
            {listFilters.dateFrom || listFilters.dateTo ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setDateError('');
                  setSearchParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      next.delete('dateFrom');
                      next.delete('dateTo');
                      setListPageParam(next, 1);
                      return next;
                    },
                    { replace: true },
                  );
                }}
              >
                Limpiar fechas
              </Button>
            ) : null}
          </form>
        )}
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
        <Skeleton label="Cargando facturas" variant="table" filterBar={false} lines={8} />
      ) : (
        <LoadingOverlay active={result.isRefreshing} label="Actualizando facturas">
          <SalesTable
            rows={visibleRows}
            hasQuery={
              query.trim().length > 0 ||
              hasKpiFilter ||
              Boolean(listFilters.dateFrom || listFilters.dateTo)
            }
            showPaymentSettlement={showPaymentSettlement}
          />
          <PaginationBar
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            onPageChange={goToPage}
          />
        </LoadingOverlay>
      )}
    </>
  );
}
