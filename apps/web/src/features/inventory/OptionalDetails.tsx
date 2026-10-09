import type { ReactNode } from 'react';

type OptionalDetailsProps = {
  children: ReactNode;
  summary?: string;
};

/**
 * Progressive disclosure for enrichment fields. Native details/summary
 * stays keyboard-accessible without a new UI library.
 */
export function OptionalDetails({
  children,
  summary = 'Información adicional (opcional)',
}: OptionalDetailsProps) {
  return (
    <details className="rounded-lg border border-navy-200 bg-navy-50/40 p-3">
      <summary className="cursor-pointer text-sm font-medium text-navy">{summary}</summary>
      <p className="mt-2 text-xs text-navy-400">
        No es necesario para registrar. Puede completarse después desde el detalle.
      </p>
      <div className="mt-3 space-y-4">{children}</div>
    </details>
  );
}
