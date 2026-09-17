import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ABANDONED_DRAFT_AFTER_HOURS } from '../../api/contracts/recovery';
import { KpiCard } from '../../shared/layout/KpiCard';
import { PageHeader } from '../../shared/layout/PageHeader';
import { Button, Card, Empty, Field, Info, Input, LoadingOverlay, SectionTitle, useToast } from '../../shared/ui';
import { useRecovery } from './useRecovery';

export function AdminRecoveryPage() {
  const { query, isMutating, releaseReservation, retryUsd } = useRecovery();
  const { pushToast } = useToast();
  const [reasonByDraft, setReasonByDraft] = useState<Record<string, string>>({});

  if (query.status === 'loading') {
    return (
      <p className="text-sm text-navy-400" aria-live="polite">
        Cargando recuperación…
      </p>
    );
  }

  if (query.status === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar la recuperación">
        {query.error.message}
      </Info>
    );
  }

  const { snapshot } = query;

  async function handleRelease(draftId: string) {
    const reason = (reasonByDraft[draftId] ?? '').trim();
    const response = await releaseReservation({ draftId, reason });
    if (!response.ok) {
      pushToast(response.error.message, 'error');
      return;
    }
    pushToast('Reserva liberada y borrador descartado', 'success');
  }

  async function handleRetry(invoiceId: string) {
    const response = await retryUsd({ invoiceId });
    if (!response.ok) {
      pushToast(response.error.message, 'error');
      return;
    }
    pushToast('Reintento de rentabilidad en dólares registrado', 'success');
  }

  return (
    <>
      <PageHeader
        title="Administración y Recuperación"
        description="Operaciones de corrección. Cada acción deja un registro en el historial."
      />

      <LoadingOverlay active={query.isRefreshing} label="Actualizando recuperación">
      <div className="space-y-8">
        <div
          className={`grid gap-4 sm:grid-cols-2 ${snapshot.diagnostics.length >= 3 ? 'xl:grid-cols-3' : ''}`}
        >
          {snapshot.diagnostics.map((item) => (
            <KpiCard key={item.id} label={item.label} value={String(item.count)} hint={item.hint} />
          ))}
        </div>

        <section>
          <SectionTitle
            title="Reservas abandonadas"
            subtitle={`Borradores con al menos ${ABANDONED_DRAFT_AFTER_HOURS} horas: libera la reserva y descarta el borrador`}
          />
          {snapshot.abandonedReservations.length === 0 ? (
            <Empty
              title="No hay reservas atascadas"
              description="Los borradores con piezas o cantidad reservada aparecen aquí."
            />
          ) : (
            <div className="space-y-3">
              {snapshot.abandonedReservations.map((row) => (
                <Card key={row.draftId}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="font-medium text-navy">
                        <Link className="underline" to={row.href}>
                          {row.draftId}
                        </Link>
                      </p>
                      <p className="text-sm text-navy-400">
                        {row.customerName}
                        {row.reservedItemIds.length > 0
                          ? ` · Piezas: ${row.reservedItemIds.join(', ')}`
                          : ''}
                        {row.reservedQtyProductIds.length > 0
                          ? ` · Cantidad: ${row.reservedQtyProductIds.join(', ')}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <Field label="Motivo" htmlFor={`reason-${row.draftId}`}>
                        <Input
                          id={`reason-${row.draftId}`}
                          value={reasonByDraft[row.draftId] ?? ''}
                          onChange={(event) =>
                            setReasonByDraft((current) => ({
                              ...current,
                              [row.draftId]: event.target.value,
                            }))
                          }
                          placeholder="Borrador abandonado"
                        />
                      </Field>
                      <Button
                        variant="danger"
                        disabled={isMutating}
                        onClick={() => void handleRelease(row.draftId)}
                      >
                        Liberar reserva
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle
            title="Rentabilidad en dólares pendiente"
            subtitle="No reabre la venta ni modifica pagos"
          />
          {snapshot.pendingFx.length === 0 ? (
            <Empty title="No hay cálculos pendientes de tasa de cambio" />
          ) : (
            <ul className="space-y-2">
              {snapshot.pendingFx.map((row) => (
                <li
                  key={row.invoiceId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy-100 bg-white px-4 py-3"
                >
                  <Link className="font-medium underline" to={row.href}>
                    {row.number}
                  </Link>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isMutating}
                    onClick={() => void handleRetry(row.invoiceId)}
                  >
                    Reintentar rentabilidad en dólares
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle title="Accesos rápidos" />
          <div className="grid gap-3 sm:grid-cols-2">
            {snapshot.quickLinks.map((link) => (
              <Link
                key={link.id}
                to={link.href}
                className="rounded-xl border border-navy-100 bg-white px-4 py-3 hover:border-brand/40"
              >
                <p className="font-medium text-navy">{link.label}</p>
                <p className="text-sm text-navy-400">{link.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
      </LoadingOverlay>
    </>
  );
}
