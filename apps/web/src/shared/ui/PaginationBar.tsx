import { Button } from './Button';

export type PaginationBarProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
};

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  disabled = false,
}: PaginationBarProps) {
  if (total <= 0 || pageSize <= 0) {
    return null;
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Paginación"
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-navy-400">
        Mostrando {from}–{to} de {total}
      </p>
      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Anterior
          </Button>
          <span className="min-w-[3ch] text-center text-sm font-medium tabular-nums text-navy">
            {page} / {pageCount}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled || page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
