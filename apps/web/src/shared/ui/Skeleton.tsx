const LINE_WIDTHS = ['100%', '92%', '96%', '88%', '94%'] as const;

const LINE_HEIGHT: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-3 rounded-md',
  md: 'h-4 rounded-md',
  lg: 'h-16 rounded-xl',
};

const KPI_GRID_COLS: Record<2 | 3 | 4, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 xl:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
};

export type SkeletonProps = {
  /** Accessible name announced while the page is loading. */
  label: string;
  className?: string;
  lines?: number;
  /**
   * Visual shape of the skeleton:
   * - `'lines'` (default): horizontal bars of varying width — generic lists.
   * - `'table'`: filter-bar block + table rows — pages with a search/filter bar above a table.
   * - `'kpi-grid'`: metric tile grid — dashboard and report pages with KpiCards.
   * - `'cards'`: alias for `'kpi-grid'` (4 columns) kept for legacy usage.
   */
  variant?: 'lines' | 'table' | 'kpi-grid' | 'cards';
  /** Number of grid columns for `kpi-grid`. Defaults to 4. */
  cols?: 2 | 3 | 4;
  /** Mechanic screens keep pulse blocks large enough to read as cards. */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to render a filter bar placeholder above table rows. Defaults to true. */
  filterBar?: boolean;
};

export function Skeleton({
  label,
  className = '',
  lines = 5,
  variant = 'lines',
  cols = 4,
  size = 'md',
  filterBar = true,
}: SkeletonProps) {
  // 'cards' is an alias for 'kpi-grid' with 4 columns, kept for backward compatibility.
  const resolvedVariant = variant === 'cards' ? 'kpi-grid' : variant;

  return (
    <div role="status" aria-busy="true" aria-live="polite" aria-label={label} className={className}>
      <p className="sr-only">{label}</p>

      {resolvedVariant === 'kpi-grid' && (
        <div className={`grid gap-4 ${KPI_GRID_COLS[cols]}`} aria-hidden="true">
          {Array.from({ length: lines }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-navy-100" />
          ))}
        </div>
      )}

      {resolvedVariant === 'table' && (
        <div className="space-y-4" aria-hidden="true">
          {/* Filter bar placeholder */}
          {filterBar && <div className="h-10 w-full animate-pulse rounded-lg bg-navy-100" />}
          {/* Table rows */}
          <div className="space-y-2">
            {Array.from({ length: lines }, (_, index) => (
              <div
                key={index}
                className="h-10 animate-pulse rounded-md bg-navy-100"
                style={{ width: LINE_WIDTHS[index % LINE_WIDTHS.length] }}
              />
            ))}
          </div>
        </div>
      )}

      {resolvedVariant === 'lines' && (
        <div className="space-y-3" aria-hidden="true">
          {Array.from({ length: lines }, (_, index) => (
            <div
              key={index}
              className={`animate-pulse bg-navy-100 ${LINE_HEIGHT[size]}`}
              style={{ width: LINE_WIDTHS[index % LINE_WIDTHS.length] }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
