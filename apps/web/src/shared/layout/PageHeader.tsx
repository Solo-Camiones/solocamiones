import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export type BreadcrumbItem = {
  label: string;
  /** If omitted, the item renders as plain text (current page). */
  to?: string;
};

export type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Icon-only control aligned with the title (e.g. back navigation). */
  leading?: ReactNode;
  /** Tighter vertical rhythm for dense dashboards. */
  compact?: boolean;
  /** Navigation trail shown above the title. Last item is the current page. */
  breadcrumbs?: BreadcrumbItem[];
};

export function PageHeader({ title, description, actions, leading, compact = false, breadcrumbs }: PageHeaderProps) {
  return (
    <header
      className={`flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${compact ? 'mb-5' : 'mb-8'}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {leading}
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs text-navy-400">
              {breadcrumbs.map((crumb, index) => (
                <span key={index} className="flex items-center gap-1">
                  {index > 0 && <span aria-hidden>/</span>}
                  {crumb.to ? (
                    <Link
                      to={crumb.to}
                      className="hover:text-navy hover:underline transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-navy-300" aria-current="page">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
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
