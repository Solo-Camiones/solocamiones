import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { ManagedUser } from '../../api/contracts/users';
import type {
  SellerSalesReport,
  SellerSalesReportFilters,
} from '../../api/contracts/sales';
import { parseListPage, setListPageParam } from '../../api/contracts/pagination';
import { salesRepository, userRepository } from '../../api/repositories';
import { PageHeader } from '../../shared/layout/PageHeader';
import {
  Button,
  Empty,
  Field,
  HoverRow,
  Info,
  Input,
  LoadingOverlay,
  money,
  Mono,
  PaginationBar,
  Select,
  Skeleton,
  TableShell,
  toPageLoadMessage,
} from '../../shared/ui';

const DOCUMENT_TYPE_LABEL = {
  INVOICE: 'Factura',
  QUOTE: 'Cotización',
} as const;

const SELLER_PICKER_ROLES = new Set(['SELLER', 'ADMINISTRATOR']);

function formatDocumentDate(value: string): string {
  return new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

/** Walk every users page, then keep Seller + Administrator for the report filter. */
async function loadSellerPickerOptions(): Promise<
  { ok: true; value: ManagedUser[] } | { ok: false; message: string }
> {
  const users: ManagedUser[] = [];
  let page = 1;
  let total = 0;

  do {
    const response = await userRepository.list(page);
    if (!response.ok) {
      return { ok: false, message: response.error.message };
    }
    users.push(...response.value.items);
    total = response.value.total;
    if (response.value.items.length === 0) break;
    page += 1;
  } while (users.length < total);

  return {
    ok: true,
    value: users
      .filter((user) => SELLER_PICKER_ROLES.has(user.role))
      .sort((left, right) => left.name.localeCompare(right.name, 'es')),
  };
}

function buildFilters(
  dateFrom: string,
  dateTo: string,
  sellerUserId: string,
  page: number,
): SellerSalesReportFilters | null {
  const from = dateFrom.trim();
  const to = dateTo.trim();
  if (!from || !to) return null;
  return {
    dateFrom: from,
    dateTo: to,
    page,
    ...(sellerUserId ? { sellerUserId } : {}),
  };
}

export function SellerSalesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseListPage(searchParams.get('page'));
  const urlDateFrom = searchParams.get('dateFrom') ?? '';
  const urlDateTo = searchParams.get('dateTo') ?? '';
  const urlSellerUserId = searchParams.get('sellerUserId') ?? '';

  const [dateFrom, setDateFrom] = useState(urlDateFrom);
  const [dateTo, setDateTo] = useState(urlDateTo);
  const [sellerUserId, setSellerUserId] = useState(urlSellerUserId);
  const [sellerOptions, setSellerOptions] = useState<ManagedUser[]>([]);
  const [sellersStatus, setSellersStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sellersError, setSellersError] = useState<string>();
  const [filterError, setFilterError] = useState<string>();
  const [queryError, setQueryError] = useState<string>();
  const [downloadError, setDownloadError] = useState<string>();
  const [isQuerying, setIsQuerying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [report, setReport] = useState<SellerSalesReport | null>(null);

  const hasConsulted = Boolean(urlDateFrom && urlDateTo);

  useEffect(() => {
    setDateFrom(urlDateFrom);
    setDateTo(urlDateTo);
    setSellerUserId(urlSellerUserId);
  }, [urlDateFrom, urlDateTo, urlSellerUserId]);

  useEffect(() => {
    let cancelled = false;
    loadSellerPickerOptions().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setSellersStatus('error');
        setSellersError(result.message);
        return;
      }
      setSellerOptions(result.value);
      setSellersStatus('ready');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const filters = buildFilters(urlDateFrom, urlDateTo, urlSellerUserId, page);
    if (!filters) {
      setReport(null);
      return;
    }
    if (filters.dateFrom > filters.dateTo) {
      setReport(null);
      setQueryError('La fecha desde debe ser anterior o igual a la fecha hasta.');
      return;
    }

    let cancelled = false;
    setIsQuerying(true);
    setQueryError(undefined);
    void salesRepository.listSellerSalesReport(filters).then((response) => {
      if (cancelled) return;
      setIsQuerying(false);
      if (!response.ok) {
        setReport(null);
        setQueryError(response.error.message);
        return;
      }
      setReport(response.value);
    });

    return () => {
      cancelled = true;
    };
  }, [urlDateFrom, urlDateTo, urlSellerUserId, page]);

  const canConsult = Boolean(dateFrom.trim() && dateTo.trim()) && !isQuerying;
  const canDownload = Boolean(report && report.total > 0) && !isDownloading;

  function onConsult(event: FormEvent) {
    event.preventDefault();
    setFilterError(undefined);
    setQueryError(undefined);
    setDownloadError(undefined);

    const from = dateFrom.trim();
    const to = dateTo.trim();
    if (!from || !to) {
      setFilterError('Indique fecha desde y fecha hasta.');
      return;
    }
    if (from > to) {
      setFilterError('La fecha desde debe ser anterior o igual a la fecha hasta.');
      return;
    }

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('dateFrom', from);
        next.set('dateTo', to);
        if (sellerUserId) next.set('sellerUserId', sellerUserId);
        else next.delete('sellerUserId');
        setListPageParam(next, 1);
        return next;
      },
      { replace: true },
    );
  }

  async function onDownload() {
    if (!report || report.total === 0 || isDownloading) return;
    setDownloadError(undefined);
    setIsDownloading(true);
    const filters: SellerSalesReportFilters = {
      dateFrom: report.dateFrom,
      dateTo: report.dateTo,
      ...(report.sellerUserId ? { sellerUserId: report.sellerUserId } : {}),
    };
    const response = await salesRepository.getSellerSalesReportPdf(filters);
    setIsDownloading(false);
    if (!response.ok) {
      setDownloadError(response.error.message);
      return;
    }
    const url = URL.createObjectURL(response.value.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = response.value.filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function goToPage(nextPage: number) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        setListPageParam(next, nextPage);
        return next;
      },
      { replace: true },
    );
  }

  if (sellersStatus === 'loading') {
    return <Skeleton label="Cargando ventas por vendedor" variant="table" lines={5} />;
  }

  if (sellersStatus === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar ventas por vendedor">
        {toPageLoadMessage(sellersError ?? '', 'No pudimos cargar la lista de vendedores.')}
      </Info>
    );
  }

  return (
    <LoadingOverlay active={isQuerying || isDownloading} label={isDownloading ? 'Generando PDF…' : 'Consultando…'}>
      <PageHeader
        title="Ventas por vendedor"
        description="Consulta facturas completadas y cotizaciones emitidas por vendedor en un rango de fechas."
      />

      <form
        className="mb-6 grid gap-4 rounded-xl border border-navy-100 bg-white p-4 md:grid-cols-2 lg:grid-cols-4"
        onSubmit={onConsult}
      >
        <Field label="Desde" htmlFor="seller-sales-from" error={filterError}>
          <Input
            id="seller-sales-from"
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setFilterError(undefined);
            }}
          />
        </Field>
        <Field label="Hasta" htmlFor="seller-sales-to">
          <Input
            id="seller-sales-to"
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setFilterError(undefined);
            }}
          />
        </Field>
        <Field label="Vendedor" htmlFor="seller-sales-seller">
          <Select
            id="seller-sales-seller"
            searchable
            searchPlaceholder="Buscar vendedor…"
            value={sellerUserId}
            onChange={(event) => setSellerUserId(event.target.value)}
          >
            <option value="">Todos los vendedores</option>
            {sellerOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
                {user.active ? '' : ' (inactivo)'}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={!canConsult}>
            Consultar
          </Button>
          <Button type="button" variant="secondary" disabled={!canDownload} onClick={onDownload}>
            Descargar PDF
          </Button>
        </div>
      </form>

      {queryError ? (
        <div className="mb-4">
          <Info tone="error" title="No se pudo consultar el reporte">
            {queryError}
          </Info>
        </div>
      ) : null}
      {downloadError ? (
        <div className="mb-4">
          <Info tone="error" title="No se pudo descargar el PDF">
            {downloadError}
          </Info>
        </div>
      ) : null}

      {!hasConsulted ? (
        <Empty
          title="Seleccione un rango de fechas"
          description="Pulse Consultar para ver las ventas del período. La descarga PDF se habilita cuando hay al menos un registro."
        />
      ) : report && report.total === 0 ? (
        <Empty
          title="Sin resultados"
          description="No hay facturas completadas ni cotizaciones emitidas para esos filtros."
        />
      ) : report ? (
        <div className="space-y-6">
          <TableShell>
            <thead className="border-b border-navy-100 bg-navy-50 text-navy-400">
              <tr>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Vendedor</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Moneda</th>
                <th className="px-4 py-3 font-medium text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {report.rows.map((row) => (
                <HoverRow key={`${row.documentType}:${row.number}`}>
                  <td className="px-4 py-3 text-sm text-navy">
                    {DOCUMENT_TYPE_LABEL[row.documentType]}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Mono>{row.number}</Mono>
                  </td>
                  <td className="px-4 py-3 text-sm text-navy">{formatDocumentDate(row.documentDate)}</td>
                  <td className="px-4 py-3 text-sm text-navy">{row.sellerName}</td>
                  <td className="px-4 py-3 text-sm text-navy">{row.customerName}</td>
                  <td className="px-4 py-3 text-sm text-navy">{row.currency}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-navy">
                    {money(Number(row.gross), row.currency)}
                  </td>
                </HoverRow>
              ))}
            </tbody>
          </TableShell>

          <PaginationBar
            page={report.page}
            pageSize={report.pageSize}
            total={report.total}
            onPageChange={goToPage}
          />

          {report.totals.length > 0 ? (
            <div className="rounded-xl border border-navy-100 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-navy">Totales por vendedor</h2>
              <TableShell>
                <thead className="border-b border-navy-100 bg-navy-50 text-navy-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Vendedor</th>
                    <th className="px-4 py-3 font-medium">Moneda</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {report.totals.map((total) => (
                    <tr key={`${total.sellerUserId}:${total.currency}`} className="text-sm text-navy">
                      <td className="px-4 py-3 font-medium">{total.sellerName}</td>
                      <td className="px-4 py-3">{total.currency}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {money(Number(total.gross), total.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            </div>
          ) : null}
        </div>
      ) : null}
    </LoadingOverlay>
  );
}
