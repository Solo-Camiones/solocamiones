import { useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { ProfitabilityChartPoint } from '../../api/contracts/profitability';
import { Card, money, SectionTitle } from '../../shared/ui';
import {
  EVOLUTION_CHART_HEIGHT_PX,
  MONTHLY_CHART_HEIGHT_PX,
  type CombinedDayPoint,
} from './chart-data';

const PROFIT_COLOR = '#0ea5e9';
const COLLECTED_COLOR = '#0c1e3a';
const GRID_COLOR = '#e2e8f0';
const TICK_COLOR = '#64748b';
const INACTIVE_LEGEND_COLOR = '#94a3b8';

type SeriesKey = 'profit' | 'collected';

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card padding="md" className="relative min-w-0 overflow-hidden">
      <SectionTitle title={title} subtitle={subtitle} />
      {children}
    </Card>
  );
}

function ChartViewport({ title, height, children }: { title: string; height: number; children: ReactNode }) {
  return (
    <div className="relative w-full min-w-0 overflow-hidden" style={{ height }} role="img" aria-label={title}>
      {children}
    </div>
  );
}

function formatAxisMoney(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}RD$${Math.abs(rounded).toLocaleString('en-US')}`;
}

function tickInterval(count: number): number {
  if (count <= 10) return 0;
  return Math.max(0, Math.ceil(count / 8) - 1);
}

function hasChartAmount(points: ProfitabilityChartPoint[]): boolean {
  return points.some((point) => point.amount !== 0);
}

type TooltipRow = {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
};

function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipRow[];
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm shadow-sm">
      <p className="mb-1 font-medium text-navy">{label}</p>
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2 text-navy-700">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name ? <span>{entry.name}</span> : null}
            <span className="ml-auto font-mono tabular-nums text-navy">
              {typeof entry.value === 'number' ? money(entry.value, 'DOP') : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MonthlyTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipRow[];
}) {
  const amount = payload?.[0]?.value;
  if (!active || typeof amount !== 'number') {
    return null;
  }

  return (
    <div className="rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm shadow-sm">
      <p className="font-medium text-navy">{label}</p>
      <p className="mt-0.5 font-mono tabular-nums text-navy">{money(amount, 'DOP')}</p>
    </div>
  );
}

function HiddenSeriesTable({
  caption,
  rows,
  columns,
}: {
  caption: string;
  rows: Array<{ key: string; label: string } & Record<string, string | number>>;
  columns: Array<{ key: string; header: string }>;
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Período</th>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              {columns.map((column) => (
                <td key={column.key}>
                  {typeof row[column.key] === 'number'
                    ? money(row[column.key] as number, 'DOP')
                    : String(row[column.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartEmptyState({ title }: { title: string }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ height: MONTHLY_CHART_HEIGHT_PX }}
      role="img"
      aria-label={title}
    >
      <p className="text-sm text-navy-400">No hay datos para este período</p>
    </div>
  );
}

function MonthlyBarChart({
  title,
  subtitle,
  points,
  color,
}: {
  title: string;
  subtitle: string;
  points: ProfitabilityChartPoint[];
  color: string;
}) {
  if (!hasChartAmount(points)) {
    return (
      <ChartCard title={title} subtitle={subtitle}>
        <ChartEmptyState title={title} />
      </ChartCard>
    );
  }

  return (
    <ChartCard title={title} subtitle={subtitle}>
      <ChartViewport title={title} height={MONTHLY_CHART_HEIGHT_PX}>
        <ResponsiveContainer width="100%" height={MONTHLY_CHART_HEIGHT_PX}>
          <BarChart data={points} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: TICK_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={formatAxisMoney}
              tick={{ fill: TICK_COLOR, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={88}
            />
            <Tooltip content={<MonthlyTooltip />} cursor={{ fill: 'rgba(12, 30, 58, 0.04)' }} />
            <Bar dataKey="amount" name="Monto" fill={color} radius={[6, 6, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </ChartViewport>
      <HiddenSeriesTable caption={title} rows={points} columns={[{ key: 'amount', header: 'Monto' }]} />
    </ChartCard>
  );
}

export function ProfitabilityCharts({
  daily,
  profitByMonth,
  collectedByMonth,
}: {
  daily: CombinedDayPoint[];
  profitByMonth: ProfitabilityChartPoint[];
  collectedByMonth: ProfitabilityChartPoint[];
}) {
  const [hidden, setHidden] = useState<Record<SeriesKey, boolean>>({
    profit: false,
    collected: false,
  });

  function toggleSeries(key: SeriesKey) {
    setHidden((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="grid min-w-0 gap-4">
      <ChartCard title="Evolución financiera" subtitle="Ganancia bruta y cobrado neto por día, en pesos.">
        <ChartViewport title="Evolución financiera" height={EVOLUTION_CHART_HEIGHT_PX}>
          <ResponsiveContainer width="100%" height={EVOLUTION_CHART_HEIGHT_PX}>
            <AreaChart data={daily} margin={{ top: 8, right: 12, left: 4, bottom: 24 }}>
              <defs>
                <linearGradient id="profitArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PROFIT_COLOR} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={PROFIT_COLOR} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="collectedArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLLECTED_COLOR} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={COLLECTED_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                interval={tickInterval(daily.length)}
                tick={{ fill: TICK_COLOR, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="profit"
                orientation="left"
                tickFormatter={formatAxisMoney}
                tick={{ fill: PROFIT_COLOR, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={88}
              />
              <YAxis
                yAxisId="collected"
                orientation="right"
                tickFormatter={formatAxisMoney}
                tick={{ fill: COLLECTED_COLOR, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={88}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={24}
                wrapperStyle={{ fontSize: 13, color: '#0c1e3a', overflow: 'hidden', cursor: 'pointer' }}
                formatter={(value, entry) => {
                  const key = entry.dataKey === 'collected' ? 'collected' : 'profit';
                  return (
                    <span style={{ color: hidden[key] ? INACTIVE_LEGEND_COLOR : '#0c1e3a' }}>{value}</span>
                  );
                }}
                onClick={(entry) => {
                  const key = entry.dataKey === 'collected' ? 'collected' : 'profit';
                  toggleSeries(key);
                }}
              />
              <Area
                yAxisId="profit"
                type="monotone"
                dataKey="profit"
                name="Ganancia bruta"
                stroke={PROFIT_COLOR}
                strokeWidth={2}
                fill="url(#profitArea)"
                hide={hidden.profit}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Area
                yAxisId="collected"
                type="monotone"
                dataKey="collected"
                name="Cobrado neto"
                stroke={COLLECTED_COLOR}
                strokeWidth={2}
                fill="url(#collectedArea)"
                hide={hidden.collected}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartViewport>
        <HiddenSeriesTable
          caption="Evolución financiera"
          rows={daily}
          columns={[
            { key: 'profit', header: 'Ganancia bruta' },
            { key: 'collected', header: 'Cobrado neto' },
          ]}
        />
      </ChartCard>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <MonthlyBarChart
          title="Ganancia por mes"
          subtitle="Últimos 6 meses, en pesos."
          points={profitByMonth}
          color={PROFIT_COLOR}
        />
        <MonthlyBarChart
          title="Cobrado neto por mes"
          subtitle="Últimos 6 meses, en pesos."
          points={collectedByMonth}
          color={COLLECTED_COLOR}
        />
      </div>
    </div>
  );
}
