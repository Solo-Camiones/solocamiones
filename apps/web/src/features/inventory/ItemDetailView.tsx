import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { ItemDetailView } from '../../api/contracts/inventory';
import { useAuth } from '../auth/useAuth';
import { can } from '../../shared/auth/policies';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { UX_TERMS } from '../../shared/copy/glossary';
import { labeledAttributeEntries } from '../../shared/domain/category-attributes';
import { Card, EventTimeline, Mono, SectionTitle, money } from '../../shared/ui';
import { HierarchyTree } from './HierarchyTree';
import { PhotoGrid } from './PhotoGrid';
import { StatusPanel } from './StatusPanel';

const WO_TYPE: Record<string, string> = {
  DISMANTLING: UX_TERMS.dismantling,
  INSTALLATION: 'Instalación',
};

const WO_STATUS: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En proceso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export function ItemDetailViewPanel({
  detail,
  actions,
}: {
  detail: ItemDetailView;
  actions: ReactNode;
}) {
  const { user } = useAuth();
  const { workOrders } = useAppCapabilities();
  const canManageWorkOrders = can(user, 'workOrders.manage');
  const category = detail.catalogCategories.find((entry) => entry.id === detail.categoryId);
  const attributeEntries = labeledAttributeEntries(category?.attributes, detail.attributes);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-navy-400">
            <Link to="/inventory" className="text-brand hover:underline">
              Inventario
            </Link>
            {detail.ancestors.map((ancestor) => (
              <span key={ancestor.id}>
                {' / '}
                <Link to={`/inventory/${ancestor.id}`} className="text-brand hover:underline">
                  {ancestor.id}
                </Link>
              </span>
            ))}
            {' / '}
            <Mono>{detail.id}</Mono>
          </p>
          <h1 className="mt-1 text-3xl font-bold text-navy">{detail.name}</h1>
          <p className="mt-1 text-navy-400">
            {detail.isAssembly ? 'Ensamblaje' : 'Pieza'} · {detail.categoryName}
            {detail.brand ? ` · ${detail.brand}` : ''}
            {detail.model ? ` ${detail.model}` : ''}
          </p>
        </div>
        {actions}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <StatusPanel detail={detail} />
        <PhotoGrid photos={detail.photos} />
      </div>

      <Card>
        <SectionTitle
          title="Composición física"
          subtitle={
            detail.isAssembly
              ? 'El árbol muestra este ensamblaje, su padre si está instalado, y solo sus piezas descendientes — no los hermanos al mismo nivel.'
              : 'Esta pieza no es ensamblaje: no tiene checklist de completitud. El árbol muestra el padre y solo los descendientes de esta pieza.'
          }
        />
        <HierarchyTree tree={detail.tree} currentId={detail.id} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Identificación y costo" />
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-navy-400">Número de parte</dt>
              <dd>{detail.partNumber ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-navy-400">Serial</dt>
              <dd>{detail.serial ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-navy-400">Costo de adquisición</dt>
              <dd className="font-mono">
                {detail.acquisitionCostDop != null
                  ? money(detail.acquisitionCostDop)
                  : 'Desconocido'}
              </dd>
            </div>
            <div>
              <dt className="text-navy-400">Procedencia</dt>
              <dd>{detail.costProvenance ?? '—'}</dd>
            </div>
            {attributeEntries.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-navy-400">Atributos de categoría</dt>
                <dd>
                  {attributeEntries.map((entry) => `${entry.label}: ${entry.value}`).join(' · ')}
                </dd>
              </div>
            )}
          </dl>
          {detail.notes && <p className="mt-3 text-sm text-navy-400">{detail.notes}</p>}
        </Card>

        {workOrders && canManageWorkOrders && (
          <Card>
            <SectionTitle title="Órdenes de trabajo" />
            {detail.workOrders.length === 0 ? (
              <p className="text-sm text-navy-400">Sin órdenes de trabajo ligadas a esta pieza.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {detail.workOrders.map((order) => (
                  <li key={order.id} className="rounded-lg bg-navy-50 px-3 py-2">
                    <Mono>{order.id}</Mono>
                    <span className="ml-2">
                      {WO_TYPE[order.type]} · {WO_STATUS[order.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Card>
        <EventTimeline
          title="Historial"
          subtitle="Quién realizó cada cambio auditado de esta pieza."
          emptyTitle="Aún no hay eventos con esta pieza."
          events={detail.events}
        />
      </Card>
    </div>
  );
}
