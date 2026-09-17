import { Link, useNavigate } from 'react-router-dom';

import { UX_TERMS } from '../../shared/copy/glossary';
import { Empty, LoadingOverlay, Skeleton, useToast } from '../../shared/ui';
import { MechanicOrderCard } from './MechanicOrderCard';
import { MechanicQueryError } from './MechanicQueryError';
import { toMechanicUserMessage } from './mechanic-copy';
import { useMechanicOrders } from './useMechanicOrders';

const emptyLinkClass =
  'inline-flex min-h-12 items-center justify-center rounded-lg bg-brand px-5 text-base font-medium text-white';

export function MechanicPendingPage() {
  const { result, isMutating, takeOrder, reload } = useMechanicOrders();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  if (result.status === 'error') {
    return (
      <MechanicQueryError title="No se pudo cargar la cola" error={result.error} onRetry={reload} />
    );
  }

  if (result.status === 'loading') {
    return <Skeleton label="Cargando pendientes" size="lg" lines={4} />;
  }

  const pending = result.orders.filter((order) => order.status === 'PENDING');

  async function handleTake(workOrderId: string) {
    const response = await takeOrder(workOrderId);
    if (!response.ok) {
      pushToast(toMechanicUserMessage(response.error), 'error');
      return;
    }
    pushToast('Orden tomada', 'success');
    navigate(response.value.href);
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Pendientes</h1>
        <p className="mt-1 text-base text-navy-400">
          Cola compartida. Al tomar una orden queda asignada a usted.
        </p>
      </header>

      {pending.length === 0 ? (
        <Empty
          title="No hay órdenes pendientes"
          description={`Las nuevas órdenes de ${UX_TERMS.dismantling.toLowerCase()} o instalación aparecerán aquí.`}
          action={
            <Link to="/mechanic/mine" className={emptyLinkClass}>
              Ver mis órdenes
            </Link>
          }
        />
      ) : (
        <LoadingOverlay active={result.isRefreshing} label="Actualizando pendientes">
          <ul className="space-y-3">
            {pending.map((order) => (
              <li key={order.id}>
                <MechanicOrderCard order={order} isMutating={isMutating} onTake={handleTake} />
              </li>
            ))}
          </ul>
        </LoadingOverlay>
      )}
    </div>
  );
}
