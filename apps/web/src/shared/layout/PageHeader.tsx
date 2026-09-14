import type { ReactNode } from 'react';

export type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Icon-only control aligned with the title (e.g. back navigation). */
  leading?: ReactNode;
  /** Tighter vertical rhythm for dense dashboards. */
  compact?: boolean;
};

export function PageHeader({ title, description, actions, leading, compact = false }: PageHeaderProps) {
  return (
    <header
      className={`flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${compact ? 'mb-5' : 'mb-8'}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {leading}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold break-words text-navy sm:text-3xl">{title}</h1>
          {description && (
            <p className={`max-w-2xl text-navy-400 ${compact ? 'mt-1 text-sm' : 'mt-2'}`}>{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {actions}
        </div>
      )}
    </header>
  );
}
