import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useMockApi } from '../../api/client/http-client';
import { businessDateFromTimestamp, businessDateString } from '../../api/client/profitability-series';
import type { ProfitabilityInvoiceRow } from '../../api/contracts/profitability';
import { FxStatusChip } from '../../shared/domain';
import { KpiCard } from '../../shared/layout/KpiCard';
import { PageHeader } from '../../shared/layout/PageHeader';
import { OPERATIONAL_HREFS } from '../../shared/navigation/operational-hrefs';
import {
  Button,
  Chip,
  Empty,
  EntityLink,
  HoverRow,
  Info,
  money,
  currencyLabel,
  SectionTitle,
  Skeleton,
  LoadingOverlay,
  TableShell,
  toPageLoadMessage,
  useToast,
} from '../../shared/ui';
import { toChartView } from './chart-data';
import {
  DEFAULT_PERIOD_PRESET,
  evolutionChartRange,
  resolvePeriodRange,
  type PeriodPreset,
} from './period';
import { ProfitabilityCharts } from './ProfitabilityCharts';
import { ProfitabilityPeriodControls } from './ProfitabilityPeriodControls';
import { RecordGrossProfitModal } from './RecordGrossProfitModal';
import { useProfitability } from './useProfitability';

function shareOfTotal(
  amount: number,
  total: number,
  suffix: string,
  whenEmpty = '—',
): string {
  if (total <= 0) return whenEmpty;
  return `${((amount / total) * 100).toFixed(1)} % ${suffix}`;
}

function IconFrame({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${className}`} aria-hidden>
      {children}
    </span>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <rect x="2.5" y="5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 8h15" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="13.5" cy="12.2" r="1" fill="currentColor" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden>
      <path
        d="M12.4 4.35 15.65 7.6 7.2 16.05H4v-3.2L12.4 4.35Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="m11.15 5.6 3.25 3.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function invoiceInRange(row: ProfitabilityInvoiceRow, from: string, to: string): boolean {
  if (!row.confirmedAt) {
    return false;
  }
  const day = businessDateFromTimestamp(row.confirmedAt);
  return day >= from && day <= to;
}

/**
 * Charts and per-invoice profit detail need acquisition cost from inventory.
 * Keep off until Release 4+ inventory cost is available; flip to true to restore UI.
 */
const SHOW_PROFIT_DETAIL_AND_CHARTS = false;

const SOURCE_TOOLTIP = {
  pending: 'La factura en dólares aún no tiene tasa guardada; el sistema no puede convertir la ganancia a pesos.',
  unavailable: 'El costo de adquisición es desconocido, así que el sistema no calcula ganancia.',
  manual: 'Ganancia registrada por el administrador según su criterio, no calculada desde el costo.',
  calculated: 'Ganancia calculada por el sistema: precio de venta menos costo de adquisición, en pesos.',
} as const;

function ProfitSourceBadge({ row }: { row: ProfitabilityInvoiceRow }) {
  if (row.pendingFx) {
    return (
      <Chip tone="amber" title={SOURCE_TOOLTIP.pending} className="cursor-help">
        Pendiente de tasa
      </Chip>
    );
  }
  if (row.profit == null) {
    return (
      <span className="text-navy-400" title={SOURCE_TOOLTIP.unavailable}>
        —
      </span>
    );
  }
  if (row.source === 'MANUAL') {
    return (
      <Chip tone="neutral" title={SOURCE_TOOLTIP.manual} className="cursor-help">
        Registrada por administrador
      </Chip>
    );
  }
  return (
    <Chip tone="brand" title={SOURCE_TOOLTIP.calculated} className="cursor-help">
      Automática
    </Chip>
  );
}

export function ProfitabilityPage() {
  const { query, isMutating, setFxAvailable, retryUsd, recordManualGrossProfit } = useProfitability();
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [recording, setRecording] = useState<ProfitabilityInvoiceRow | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [preset, setPreset] = useState<PeriodPreset>(DEFAULT_PERIOD_PRESET);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const pendingFxOnly = searchParams.get('pendingFx') === '1';
  const today = useMemo(() => businessDateString(new Date()), []);

  const range = useMemo(
    () => resolvePeriodRange({ preset, today, customFrom, customTo }),
    [preset, today, customFrom, customTo],
  );

  if (query.status === 'loading') {
    return <Skeleton label="Cargando rentabilidad" variant="kpi-grid" lines={3} cols={3} />;
  }

  if (query.status === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar la rentabilidad">
        {toPageLoadMessage(query.error.message, 'No pudimos cargar la rentabilidad.')}
      </Info>
    );
  }

  const { snapshot } = query;
  const chartRange = evolutionChartRange(range, preset, today);
  const view = toChartView(snapshot.charts, chartRange, today);

  const invoices = pendingFxOnly
    ? snapshot.invoices.filter((row) => row.pendingFx)
    : snapshot.invoices.filter((row) => invoiceInRange(row, range.from, range.to));

  function handlePresetChange(next: PeriodPreset) {
    if (next === 'custom') {
      setCustomFrom(range.from);
      setCustomTo(range.to);
    }
    setPreset(next);
  }

  function clearPendingFxFilter() {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        nextParams.delete('pendingFx');
        return nextParams;
      },
      { replace: true },
    );
  }

  async function handleToggleFx() {
    const response = await setFxAvailable(!snapshot.fxAvailable);
    if (!response.ok) {
      pushToast(response.error.message, 'error');
      return;
    }
    pushToast(
      snapshot.fxAvailable
        ? 'Tasa de cambio desactivada. Los resultados ya calculados no cambian.'
        : 'Tasa de cambio activada. Reintente las facturas pendientes.',
      'success',
    );
  }

  async function handleRetry(invoiceId: string) {
    const response = await retryUsd({ invoiceId });
    if (!response.ok) {
      pushToast(response.error.message, 'error');
      return;
    }
    pushToast('Cálculo de rentabilidad reintentado', 'success');
  }

  async function handleRecord(input: { profitDop: number }) {
    if (!recording) {
      return;
    }
    const response = await recordManualGrossProfit({
      invoiceId: recording.id,
      profitDop: input.profitDop,
    });
    if (!response.ok) {
      setRecordError(response.error.message);
      return;
    }
    setRecording(null);
    setRecordError(null);
    pushToast('Ganancia bruta registrada', 'success');
  }

  return (
    <div className="min-w-0">
      <PageHeader
        compact
        title="Rentabilidad"
        description={
          SHOW_PROFIT_DETAIL_AND_CHARTS
            ? 'Ganancia bruta, ventas y cobrado neto en pesos.'
            : 'Ventas, cobrado neto y cuentas por cobrar en pesos.'
        }
        actions={
          <div className="flex min-w-0 flex-col items-stretch gap-3 sm:items-end">
            <ProfitabilityPeriodControls
              preset={preset}
              customFrom={customFrom}
              customTo={customTo}
              resolvedRange={range}
              onPresetChange={handlePresetChange}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
            />
            {useMockApi ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <FxStatusChip available={snapshot.fxAvailable} />
                <Button variant="secondary" size="sm" onClick={() => void handleToggleFx()} disabled={isMutating}>
                  {snapshot.fxAvailable ? 'Desactivar tasa de cambio (demo)' : 'Activar tasa de cambio (demo)'}
                </Button>
              </div>
            ) : null}
          </div>
        }
      />

      <LoadingOverlay active={query.isRefreshing} label="Actualizando rentabilidad">
      <div className="grid min-w-0 gap-4">
        {/* Cards primarias: punto de entrada visual de la página */}
        <div className="grid min-w-0 gap-4 grid-cols-1 md:grid-cols-2">
          <KpiCard
            label="Cobrado neto"
            value={money(view.periodCollected, 'DOP')}
            tone="brand"
            icon={
              <IconFrame className="bg-navy-50 text-navy">
                <WalletIcon />
              </IconFrame>
            }
          />
          <KpiCard
            label="Cuentas por cobrar"
            value={money(snapshot.outstandingDop, 'DOP')}
            hint={
              snapshot.outstandingUsd > 0
                ? `Dólares pendientes: ${money(snapshot.outstandingUsd, 'USD')}`
                : 'Saldos abiertos por cobrar'
            }
            tone={snapshot.outstandingDop > 0 || snapshot.outstandingUsd > 0 ? 'amber' : 'default'}
            to={OPERATIONAL_HREFS.salesOutstanding}
            actionLabel="Ver cuentas por cobrar"
            icon={
              <IconFrame
                className={
                  snapshot.outstandingDop > 0 || snapshot.outstandingUsd > 0
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-navy-50 text-navy-400'
                }
              >
                <WalletIcon />
              </IconFrame>
            }
          />
        </div>

        {/* Cards secundarias: desglose por ventas reconocidas */}
        <section className="min-w-0">
          <SectionTitle title="Ventas del período" />
          <div className="grid min-w-0 gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {/* Total primero: es la cifra principal de la sección */}
            <KpiCard
              label="Total ventas"
              value={money(view.periodInvoicedTotal, 'DOP')}
              tone="brand"
              size="sm"
            />
            {/* Desglose: el hint indica qué fracción representa cada modalidad */}
            <KpiCard
              label="Ventas al contado"
              value={money(view.periodInvoicedCash, 'DOP')}
              hint={shareOfTotal(view.periodInvoicedCash, view.periodInvoicedTotal, 'del total')}
              tone="default"
              size="sm"
            />
            <KpiCard
              label="Ventas a crédito"
              value={money(view.periodInvoicedCredit, 'DOP')}
              hint={shareOfTotal(view.periodInvoicedCredit, view.periodInvoicedTotal, 'del total')}
              tone="default"
              size="sm"
            />
          </div>
        </section>

        {/* Cards secundarias: desglose por método de cobro */}
        <section className="min-w-0">
          <SectionTitle title="Desglose de cobrado neto por método" />
          <div className="grid min-w-0 gap-3 grid-cols-1 sm:grid-cols-3">
            <KpiCard
              label="Cobrado efectivo"
              value={money(view.periodCollectedByMethod.CASH, 'DOP')}
              hint={shareOfTotal(
                view.periodCollectedByMethod.CASH,
                view.periodCollected,
                'del cobrado neto',
                '0.0 % del cobrado neto',
              )}
              tone="default"
              size="sm"
            />
            <KpiCard
              label="Cobrado transferencia"
              value={money(view.periodCollectedByMethod.TRANSFER, 'DOP')}
              hint={shareOfTotal(
                view.periodCollectedByMethod.TRANSFER,
                view.periodCollected,
                'del cobrado neto',
                '0.0 % del cobrado neto',
              )}
              tone="default"
              size="sm"
            />
            <KpiCard
              label="Cobrado cheque"
              value={money(view.periodCollectedByMethod.CHECK, 'DOP')}
              hint={shareOfTotal(
                view.periodCollectedByMethod.CHECK,
                view.periodCollected,
                'del cobrado neto',
                '0.0 % del cobrado neto',
              )}
              tone="default"
              size="sm"
            />
          </div>
        </section>

        {SHOW_PROFIT_DETAIL_AND_CHARTS && snapshot.invoicesMissingProfitCount > 0 ? (
          <Info tone="warning" title="Facturas aún sin ganancia en las gráficas">
            {snapshot.invoicesMissingProfitCount === 1
              ? '1 factura completada no suma en ganancia porque el costo es desconocido o falta la tasa.'
              : `${snapshot.invoicesMissingProfitCount} facturas completadas no suman en ganancia porque el costo es desconocido o falta la tasa.`}
          </Info>
        ) : null}

        {snapshot.omittedUsdReceiptCount > 0 ? (
          <Info tone="warning" title="Cobros en dólares sin tasa">
            {snapshot.omittedUsdReceiptCount === 1
              ? '1 cobro o reembolso en dólares no entra en cobrado hasta que la factura tenga tasa guardada.'
              : `${snapshot.omittedUsdReceiptCount} cobros o reembolsos en dólares no entran en cobrado hasta que la factura tenga tasa guardada.`}
          </Info>
        ) : null}

        {SHOW_PROFIT_DETAIL_AND_CHARTS ? (
          <>
            <ProfitabilityCharts
              daily={view.daily}
              profitByMonth={view.profitByMonth}
              collectedByMonth={view.collectedByMonth}
            />

            {pendingFxOnly && (
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="amber">Pendientes de tasa de cambio</Chip>
                <Button variant="ghost" size="sm" onClick={clearPendingFxFilter}>
                  Quitar filtro
                </Button>
              </div>
            )}

            <section className="min-w-0">
              <SectionTitle title="Detalle de rentabilidad por factura" />
              {invoices.length === 0 ? (
                <Empty
                  title={
                    pendingFxOnly
                      ? 'No hay facturas pendientes de tasa'
                      : 'No hay facturas en este período'
                  }
                  description={
                    pendingFxOnly
                      ? 'Quitar el filtro para ver el resto de facturas.'
                      : 'Prueba otro período o espera a que se confirmen facturas.'
                  }
                />
              ) : (
                <TableShell>
                  <thead className="border-b border-navy-100 bg-navy-50 text-navy-400">
                    <tr>
                      <th className="px-4 py-3 align-middle font-medium">Factura</th>
                      <th className="px-4 py-3 align-middle font-medium">Cliente</th>
                      <th className="px-4 py-3 align-middle font-medium">Moneda</th>
                      <th className="px-4 py-3 align-middle font-medium">Total</th>
                      <th className="px-4 py-3 align-middle font-medium">Ganancia bruta</th>
                      <th className="px-4 py-3 align-middle font-medium">Cálculo</th>
                      <th className="px-4 py-3 align-middle font-medium">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {invoices.map((row) => (
                      <HoverRow key={row.id} to={row.href}>
                        <td className="px-4 py-3 align-middle font-medium text-navy">
                          <EntityLink to={row.href}>{row.number}</EntityLink>
                        </td>
                        <td className="max-w-[12rem] truncate px-4 py-3 align-middle text-navy-700">
                          {row.customerName}
                        </td>
                        <td className="px-4 py-3 align-middle">{currencyLabel(row.currency)}</td>
                        <td className="px-4 py-3 align-middle font-mono tabular-nums">
                          {money(row.total, row.currency)}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {row.pendingFx ? (
                            <span className="text-amber-800">Pendiente de tasa de cambio</span>
                          ) : row.profit == null ? (
                            <span className="text-navy-400">No disponible</span>
                          ) : (
                            <span className="font-mono tabular-nums">{money(row.profit, 'DOP')}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <ProfitSourceBadge row={row} />
                        </td>
                        <td className="px-4 py-3 align-middle whitespace-nowrap">
                          {row.pendingFx ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="min-h-9 px-2.5 py-1 text-xs"
                              disabled={isMutating}
                              onClick={() => void handleRetry(row.id)}
                            >
                              Reintentar
                            </Button>
                          ) : row.canRecordManual ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="min-h-9 gap-1.5 px-2.5 py-1 text-xs"
                              disabled={isMutating}
                              onClick={() => {
                                setRecordError(null);
                                setRecording(row);
                              }}
                            >
                              {row.profit == null ? (
                                'Registrar ganancia'
                              ) : (
                                <>
                                  <PencilIcon />
                                  Editar ganancia
                                </>
                              )}
                            </Button>
                          ) : (
                            <span className="text-navy-400">—</span>
                          )}
                        </td>
                      </HoverRow>
                    ))}
                  </tbody>
                </TableShell>
              )}
            </section>
          </>
        ) : null}
      </div>
      </LoadingOverlay>

      {SHOW_PROFIT_DETAIL_AND_CHARTS ? (
        <RecordGrossProfitModal
          open={recording != null}
          invoiceNumber={recording?.number ?? ''}
          initialProfitDop={recording?.source === 'MANUAL' ? recording.profit : null}
          isSaving={isMutating}
          error={recordError}
          onClose={() => {
            setRecording(null);
            setRecordError(null);
          }}
          onSubmit={(input) => void handleRecord(input)}
        />
      ) : null}
    </div>
  );
}
