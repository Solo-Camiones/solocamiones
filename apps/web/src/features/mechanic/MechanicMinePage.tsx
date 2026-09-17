import { Link } from 'react-router-dom';

import type { MechanicWorkOrderView } from '../../api/contracts/entities';
import { Empty, LoadingOverlay, Skeleton } from '../../shared/ui';
import { MechanicOrderCard } from './MechanicOrderCard';
import { MechanicQueryError } from './MechanicQueryError';
import { useMechanicOrders } from './useMechanicOrders';

const emptyLinkClass =
  'inline-flex min-h-12 items-center justify-center rounded-lg bg-brand px-5 text-base font-medium text-white';

function OrderList({ orders }: { orders: MechanicWorkOrderView[] }) {
  return (
    <ul className="space-y-3">
      {orders.map((order) => (
        <li key={order.id}>
          <MechanicOrderCard order={order} />
        </li>
      ))}
    </ul>
  );
}

export function MechanicMinePage() {
  const { result, reload } = useMechanicOrders();

  if (result.status === 'error') {
    return (
      <MechanicQueryError
        title="No se pudieron cargar sus órdenes"
        error={result.error}
        onRetry={reload}
      />
    );
  }

  if (result.status === 'loading') {
    return <Skeleton label="Cargando mis órdenes" size="lg" lines={4} />;
  }

  const mine = result.orders.filter((order) => order.status !== 'PENDING');
  const inProgress = mine.filter((order) => order.status === 'IN_PROGRESS');
  const completed = mine.filter((order) => order.status === 'COMPLETED');
  const cancelled = mine.filter((order) => order.status === 'CANCELLED');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold">Mis órdenes</h1>
        <p className="mt-1 text-base text-navy-400">
          Trabajo asignado a usted, en proceso o en el historial.
        </p>
      </header>

      {mine.length === 0 ? (
        <Empty
          title="Aún no tiene órdenes"
          description="Tome una orden pendiente para que aparezca aquí."
          action={
            <Link to="/mechanic/pending" className={emptyLinkClass}>
              Ver pendientes
            </Link>
          }
        />
      ) : (
        <LoadingOverlay active={result.isRefreshing} label="Actualizando mis órdenes">
          <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">En proceso</h2>
            {inProgress.length === 0 ? (
              <p className="text-base text-navy-400">No hay trabajo en proceso. Tome una orden pendiente.</p>
            ) : (
              <OrderList orders={inProgress} />
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Historial</h2>

            <div className="space-y-3">
              <h3 className="text-base font-semibold">Completadas</h3>
              {completed.length === 0 ? (
                <p className="text-base text-navy-400">Todavía no hay órdenes terminadas.</p>
              ) : (
                <OrderList orders={completed} />
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold">Canceladas</h3>
              {cancelled.length === 0 ? (
                <p className="text-base text-navy-400">No hay órdenes canceladas.</p>
              ) : (
                <OrderList orders={cancelled} />
              )}
            </div>
          </section>
          </div>
        </LoadingOverlay>
      )}
    </div>
  );
}
