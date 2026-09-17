import type { PasswordRecoveryRequest } from '../../api/contracts/users';
import { Button, Empty, Info, LoadingOverlay, SectionTitle, Skeleton, toPageLoadMessage } from '../../shared/ui';
import type { RecoveryRequestsQuery } from './useRecoveryRequests';

type Props = {
  result: RecoveryRequestsQuery;
  resolvingId: string | null;
  onApprove: (request: PasswordRecoveryRequest) => void;
  onReject: (request: PasswordRecoveryRequest) => void;
};

const dateFormatter = new Intl.DateTimeFormat('es-DO', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function RecoveryRequestsPanel({ result, resolvingId, onApprove, onReject }: Props) {
  return (
    <section className="mt-8 space-y-4" aria-label="Solicitudes de recuperación">
      <SectionTitle
        title="Solicitudes de recuperación"
        subtitle="Solo apruebe después de verificar la identidad personalmente o por teléfono."
      />
      {result.status === 'loading' && <Skeleton label="Cargando solicitudes" />}
      {result.status === 'error' && (
        <Info tone="error" title="No se pudieron cargar las solicitudes">
          {toPageLoadMessage(result.error.message, 'No pudimos cargar las solicitudes.')}
        </Info>
      )}
      {result.status === 'ready' && (
        <LoadingOverlay active={result.isRefreshing} label="Actualizando solicitudes">
          {result.rows.length === 0 ? (
            <Empty
              title="No hay solicitudes pendientes"
              description="Las solicitudes vigentes aparecerán aquí."
            />
          ) : (
            <div className="space-y-3">
              {result.rows.map((request) => (
                <article
                  key={request.id}
                  className="flex flex-col gap-3 rounded-xl border border-navy-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-navy">{request.user.name}</p>
                    <p className="text-sm text-navy-400">
                      {request.user.username} · solicitada{' '}
                      {dateFormatter.format(new Date(request.createdAt))}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={resolvingId === request.id}
                      onClick={() => onReject(request)}
                    >
                      Rechazar
                    </Button>
                    <Button
                      size="sm"
                      disabled={resolvingId === request.id}
                      onClick={() => onApprove(request)}
                    >
                      Aprobar
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </LoadingOverlay>
      )}
    </section>
  );
}
