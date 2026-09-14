import type { ReactNode } from 'react';

export const REVIEW_EMPTY_VALUE = '—';

export type ReviewSummaryRow = {
  label: string;
  value: string;
};

type ReviewSummaryProps = {
  rows: ReviewSummaryRow[];
  children?: ReactNode;
};

function displayValue(value: string): string {
  return value.trim() === '' ? REVIEW_EMPTY_VALUE : value;
}

/** Read-only label/value list for a same-dialog review step before a mutating submit. */
export function ReviewSummary({ rows, children }: ReviewSummaryProps) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[minmax(7rem,11rem)_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-navy-400">{row.label}</dt>
            <dd className="font-medium break-words text-navy">{displayValue(row.value)}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}
