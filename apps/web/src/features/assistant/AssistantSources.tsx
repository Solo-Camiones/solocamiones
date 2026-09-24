import type { AssistantSource } from '../../api/contracts/assistant';
import { Link } from 'react-router-dom';

import { toApprovedAppPath } from './approved-app-path';

type AssistantSourcesProps = {
  sources: AssistantSource[];
};

export function AssistantSources({ sources }: AssistantSourcesProps) {
  if (sources.length === 0) return null;

  const ordered = [...sources].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <aside className="mt-3 rounded-lg border border-navy-100 bg-navy-50/60 px-3 py-2" aria-label="Fuentes">
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Fuentes</p>
      <ul className="mt-1 space-y-1.5">
        {ordered.map((source) => {
          const appPath = toApprovedAppPath(source.appPath ?? undefined);
          return (
            <li key={`${source.sourceKey}-${source.sortOrder}`} className="text-sm text-navy">
              <span className="font-medium">{source.title}</span>
              {source.locator ? (
                <span className="text-navy-400"> · {source.locator}</span>
              ) : null}
              {source.asOf ? (
                <span className="block text-xs text-navy-400">
                  Datos al {formatAsOf(source.asOf)}
                </span>
              ) : null}
              {appPath ? (
                <Link
                  to={appPath}
                  className="mt-0.5 inline-block text-xs font-medium text-brand underline-offset-2 hover:underline"
                >
                  Abrir en la app
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function formatAsOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('es-DO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}
