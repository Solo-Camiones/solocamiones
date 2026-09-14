import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '../ui';

type KpiTone = 'default' | 'amber' | 'brand';

export type KpiTrend = {
  label: string;
  tone: 'up' | 'down' | 'neutral';
};

export type KpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
  icon?: ReactNode;
  trend?: KpiTrend;
  /** When set, the whole tile is a keyboard-accessible shortcut to an existing list. */
  to?: string;
  /** Replaces the default chevron when the card is a link. */
  actionLabel?: string;
};

const toneBorder: Record<KpiTone, string> = {
  default: 'border-navy-100',
  amber: 'border-amber-200',
  brand: 'border-brand/30',
};

/**
 * Compact metric tile used on Dashboard and Profitability.
 * Without `to` it stays a static card (Profitability, recovery).
 */
const trendClass: Record<KpiTrend['tone'], string> = {
  up: 'text-emerald-700',
  down: 'text-red-600',
  neutral: 'text-navy-400',
};

export function KpiCard({ label, value, hint, tone = 'default', icon, trend, to, actionLabel }: KpiCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-navy-400">{label}</p>
        <div className="flex shrink-0 items-center gap-2">
          {icon}
          {to && !actionLabel ? (
            <span className="text-sm font-medium text-navy-300 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true">
              →
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-2 truncate font-mono text-2xl font-semibold tabular-nums tracking-tight text-navy sm:text-[1.75rem]">
        {value}
      </p>
      <div className="mt-1 flex min-h-[1rem] flex-wrap items-center gap-x-2 gap-y-0.5">
        {trend ? <p className={`text-xs font-medium ${trendClass[trend.tone]}`}>{trend.label}</p> : null}
        {hint ? <p className="text-xs text-navy-400">{hint}</p> : null}
        {to && actionLabel ? (
          <p className="text-xs font-medium text-brand-dark">{actionLabel}</p>
        ) : null}
      </div>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="group block min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light/50"
      >
        <Card
          className={`h-full transition-all duration-150 hover:bg-navy-50/50 hover:shadow-md hover:-translate-y-0.5 ${toneBorder[tone]}`}
          padding="md"
        >
          {content}
        </Card>
      </Link>
    );
  }

  return (
    <Card className={`${toneBorder[tone]}`} padding="md">
      {content}
    </Card>
  );
}
