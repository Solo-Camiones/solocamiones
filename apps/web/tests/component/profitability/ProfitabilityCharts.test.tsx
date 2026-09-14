// @vitest-environment jsdom

import { cloneElement, type ReactElement, type ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfitabilityCharts } from '../../../src/features/profitability/ProfitabilityCharts';
import { money } from '../../../src/shared/ui';
import '../../support/dom';

type TooltipEntry = {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
};

type TooltipProps = {
  active?: boolean;
  label?: string;
  payload?: TooltipEntry[];
};

const rechartsState = vi.hoisted(() => ({
  chartTooltip: { active: false } as TooltipProps,
  monthlyTooltip: { active: false } as TooltipProps,
}));

vi.mock('recharts', async () => {
  const react = await import('react');

  function Container({ children }: { children?: ReactNode }) {
    return <div>{children}</div>;
  }

  function AreaChart({ children }: { children?: ReactNode }) {
    const chartChildren = react.Children.toArray(children).filter(
      (child) => !react.isValidElement(child) || child.type !== 'defs',
    );
    return <div>{chartChildren}</div>;
  }

  function Tooltip({ content }: { content: ReactElement<TooltipProps> }) {
    const isMonthly = (content.type as { name?: string }).name === 'MonthlyTooltip';
    const props = isMonthly ? rechartsState.monthlyTooltip : rechartsState.chartTooltip;
    return cloneElement(content, props);
  }

  function Legend({
    formatter,
    onClick,
  }: {
    formatter: (value: string, entry: { dataKey: string }) => ReactNode;
    onClick: (entry: { dataKey: string }) => void;
  }) {
    return (
      <div>
        {[
          { dataKey: 'profit', value: 'Ganancia bruta' },
          { dataKey: 'collected', value: 'Cobrado neto' },
        ].map((entry) => (
          <button key={entry.dataKey} type="button" onClick={() => onClick(entry)}>
            {formatter(entry.value, entry)}
          </button>
        ))}
      </div>
    );
  }

  function YAxis({ tickFormatter }: { tickFormatter: (value: number) => string }) {
    return (
      <div data-testid="axis-labels">
        {[1_200.4, -1_200.6, 0].map((value) => (
          <span key={value}>{tickFormatter(value)}</span>
        ))}
      </div>
    );
  }

  function Area({ dataKey, hide }: { dataKey: string; hide?: boolean }) {
    return <div data-testid={`area-${dataKey}`} data-hidden={String(Boolean(hide))} />;
  }

  return {
    Area,
    AreaChart,
    Bar: () => null,
    BarChart: Container,
    CartesianGrid: () => null,
    Legend,
    ResponsiveContainer: Container,
    Tooltip,
    XAxis: () => null,
    YAxis,
  };
});

const daily = [
  { key: '2026-09-11', label: '11 sept', profit: 1_250, collected: -250 },
  { key: '2026-09-12', label: '12 sept', profit: 0, collected: 0 },
];

const profitByMonth = [
  { key: '2026-08', label: 'ago 2026', amount: 1_250 },
  { key: '2026-09', label: 'sept 2026', amount: 0 },
];

const collectedByMonth = [
  { key: '2026-08', label: 'ago 2026', amount: -250 },
  { key: '2026-09', label: 'sept 2026', amount: 0 },
];

function renderCharts() {
  return render(
    <ProfitabilityCharts
      daily={daily}
      profitByMonth={profitByMonth}
      collectedByMonth={collectedByMonth}
    />,
  );
}

describe('ProfitabilityCharts', () => {
  beforeEach(() => {
    rechartsState.chartTooltip = { active: false };
    rechartsState.monthlyTooltip = { active: false };
  });

  it('presents positive, negative, and zero amounts without losing their sign', () => {
    renderCharts();

    expect(screen.getAllByText(money(1_250, 'DOP')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(money(-250, 'DOP')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(money(0, 'DOP')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('RD$1,200').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-RD$1,201').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RD$0').length).toBeGreaterThan(0);
  });

  it('shows the monthly empty state only when every amount is zero', () => {
    render(
      <ProfitabilityCharts
        daily={daily}
        profitByMonth={[{ key: '2026-09', label: 'sept 2026', amount: 0 }]}
        collectedByMonth={collectedByMonth}
      />,
    );

    expect(screen.getByText('No hay datos para este período')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Ganancia por mes' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Cobrado neto por mes' })).toBeVisible();
  });

  it('does not present a tooltip when it is inactive or has no entries', () => {
    const { rerender } = renderCharts();

    expect(screen.queryByText('Detalle diario')).not.toBeInTheDocument();

    rechartsState.chartTooltip = { active: true, label: 'Detalle diario', payload: [] };
    rerender(
      <ProfitabilityCharts
        daily={daily}
        profitByMonth={profitByMonth}
        collectedByMonth={collectedByMonth}
      />,
    );

    expect(screen.queryByText('Detalle diario')).not.toBeInTheDocument();
  });

  it('presents a valid tooltip and tolerates optional entry fields', () => {
    rechartsState.chartTooltip = {
      active: true,
      label: '11 sept',
      payload: [
        { dataKey: 'profit', name: 'Ganancia bruta', value: 1_250, color: '#0ea5e9' },
        { value: 'Sin monto' },
      ],
    };

    renderCharts();

    const tooltip = screen.getByText('11 sept', { selector: 'p' }).parentElement;
    expect(tooltip).not.toBeNull();
    expect(within(tooltip!).getByText('Ganancia bruta')).toBeVisible();
    expect(within(tooltip!).getByText(money(1_250, 'DOP'))).toBeVisible();
    expect(within(tooltip!).getByText('Sin monto')).toBeVisible();
  });

  it('presents only a valid numeric monthly tooltip', () => {
    rechartsState.monthlyTooltip = {
      active: true,
      label: 'ago 2026',
      payload: [{ value: 'Sin monto' }],
    };
    const { rerender } = renderCharts();

    expect(screen.queryByText('ago 2026', { selector: 'p' })).not.toBeInTheDocument();

    rechartsState.monthlyTooltip = {
      active: true,
      label: 'ago 2026',
      payload: [{ value: -250 }],
    };
    rerender(
      <ProfitabilityCharts
        daily={daily}
        profitByMonth={profitByMonth}
        collectedByMonth={collectedByMonth}
      />,
    );

    expect(screen.getAllByText('ago 2026', { selector: 'p' })).toHaveLength(2);
    expect(screen.getAllByText(money(-250, 'DOP'), { selector: 'p' })).toHaveLength(2);
  });

  it('alternates profit and collected independently from the legend', async () => {
    const user = userEvent.setup();
    renderCharts();

    const profitLegend = screen.getByRole('button', { name: 'Ganancia bruta' });
    const collectedLegend = screen.getByRole('button', { name: 'Cobrado neto' });
    expect(screen.getByTestId('area-profit')).toHaveAttribute('data-hidden', 'false');
    expect(screen.getByTestId('area-collected')).toHaveAttribute('data-hidden', 'false');

    await user.click(profitLegend);
    expect(screen.getByTestId('area-profit')).toHaveAttribute('data-hidden', 'true');
    expect(screen.getByTestId('area-collected')).toHaveAttribute('data-hidden', 'false');
    expect(profitLegend.firstElementChild).toHaveStyle({ color: '#94a3b8' });

    await user.click(collectedLegend);
    expect(screen.getByTestId('area-profit')).toHaveAttribute('data-hidden', 'true');
    expect(screen.getByTestId('area-collected')).toHaveAttribute('data-hidden', 'true');
    expect(collectedLegend.firstElementChild).toHaveStyle({ color: '#94a3b8' });

    await user.click(profitLegend);
    expect(screen.getByTestId('area-profit')).toHaveAttribute('data-hidden', 'false');
    expect(screen.getByTestId('area-collected')).toHaveAttribute('data-hidden', 'true');
    expect(profitLegend.firstElementChild).toHaveStyle({ color: '#0c1e3a' });
  });
});
