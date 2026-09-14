import { Link } from 'react-router-dom';

import type { CatalogReviewAlert, DashboardKpis } from '../../api/contracts/dashboard';
import type { User } from '../../api/contracts/entities';
import { can } from '../../shared/auth/policies';
import type { AppCapabilities } from '../../shared/config/capabilities';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { UX_TERMS } from '../../shared/copy/glossary';
import { KpiCard } from '../../shared/layout/KpiCard';
import { PageHeader } from '../../shared/layout/PageHeader';
import { OPERATIONAL_HREFS } from '../../shared/navigation/operational-hrefs';
import { Info, money, SectionTitle, Skeleton, toPageLoadMessage } from '../../shared/ui';
import { useAuth } from '../auth/useAuth';
import { ActivityTimeline } from './ActivityTimeline';
import { RecentInvoicesList } from './RecentInvoicesList';
import { useDashboard } from './useDashboard';

type DashboardKpiCard = {
  label: string;
  value: string;
  hint: string;
  tone?: 'default' | 'amber' | 'brand';
  to?: string;
};

function formatCount(value: number): string {
  return new Intl.NumberFormat('es-DO').format(value);
}

function attentionTone(count: number): 'amber' | 'default' {
  return count > 0 ? 'amber' : 'default';
}

function kpiGridClass(count: number): string {
  const columns =
    count >= 4 ? 'xl:grid-cols-4' : count === 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-2';
  return `grid gap-4 sm:grid-cols-2 ${columns}`;
}

function CatalogReviewBanner({ reviews }: { reviews: CatalogReviewAlert[] }) {
  return (
    <Info tone="warning" title="Catálogo: ensamblajes afectados por un componente nuevo">
      <ul className="mt-1 list-disc space-y-1 pl-4">
        {reviews.map((review) => (
          <li key={`${review.itemId}-${review.expectedComponentName}-${review.kind}`}>
            <Link to={`/inventory/${review.itemId}`} className="font-medium underline">
              {review.itemName} ({review.itemId})
            </Link>
            {review.kind === 'ALREADY_PRESENT' ? (
              <>
                {' '}
                ya tenía {review.expectedComponentName}
                {review.matchedChildId
                  ? ` (${review.matchedChildName ?? review.matchedChildId})`
                  : ''}{' '}
                en el árbol. Revise el ensamblaje si hace falta.
              </>
            ) : (
              <>
                {' '}
                ya estaba registrado y ahora {review.categoryName.toLowerCase()} espera{' '}
                {review.expectedComponentName}. Sigue completo con “no aplica” provisional hasta
                confirmar que no aplica, registrar la pieza presente o marcar falta.
              </>
            )}
          </li>
        ))}
      </ul>
    </Info>
  );
}

function KpiSection({
  title,
  subtitle,
  cards,
}: {
  title: string;
  subtitle?: string;
  cards: DashboardKpiCard[];
}) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionTitle title={title} subtitle={subtitle} />
      <div className={kpiGridClass(cards.length)}>
        {cards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>
    </section>
  );
}

/**
 * Attention queue: same gates as the snapshot (admin WO / catalog / FX) plus
 * capabilities. Incomplete assemblies stay hierarchy-only, as before.
 */
function buildAttentionKpis(
  kpis: DashboardKpis,
  capabilities: AppCapabilities,
  user: Pick<User, 'role' | 'active'> | null,
): DashboardKpiCard[] {
  const cards: DashboardKpiCard[] = [];

  if (capabilities.hierarchy && kpis.pendingCatalogValidations != null && can(user, 'inventory.admin')) {
    cards.push({
      label: 'Componentes por validar',
      value: formatCount(kpis.pendingCatalogValidations),
      hint: 'Componentes esperados aún en “no aplica” provisional',
      tone: attentionTone(kpis.pendingCatalogValidations),
      to: OPERATIONAL_HREFS.inventoryPendingCatalog,
    });
  }

  if (capabilities.workOrders && kpis.pendingDismantling != null && can(user, 'workOrders.manage')) {
    cards.push({
      label: UX_TERMS.dismantlingPending,
      value: formatCount(kpis.pendingDismantling),
      hint: `Órdenes de ${UX_TERMS.dismantling.toLowerCase()} sin asignar`,
      tone: attentionTone(kpis.pendingDismantling),
      to: OPERATIONAL_HREFS.workOrdersPendingDismantling,
    });
  }

  if (capabilities.profitability && kpis.pendingFx != null && can(user, 'profit.view')) {
    cards.push({
      label: 'Tasas de cambio pendientes',
      value: formatCount(kpis.pendingFx),
      hint: 'Rentabilidad en dólares sin tasa de cambio',
      tone: attentionTone(kpis.pendingFx),
      to: OPERATIONAL_HREFS.profitabilityPendingFx,
    });
  }

  if (capabilities.hierarchy) {
    cards.push({
      label: 'Ensamblajes incompletos',
      value: formatCount(kpis.incompleteAssemblies),
      hint: `Padres con faltantes o ${UX_TERMS.componentsPendingConfirm.toLowerCase()}`,
      tone: attentionTone(kpis.incompleteAssemblies),
      to: OPERATIONAL_HREFS.inventoryIncompleteAssemblies,
    });
  }

  return cards;
}

function buildTodayKpis(
  kpis: DashboardKpis,
  capabilities: AppCapabilities,
  user: Pick<User, 'role' | 'active'> | null,
): DashboardKpiCard[] {
  const cards: DashboardKpiCard[] = [];

  if (capabilities.sales) {
    cards.push({
      label: 'Facturas de hoy',
      value: formatCount(kpis.invoicesToday),
      hint: 'Confirmadas hoy',
      to: OPERATIONAL_HREFS.salesToday,
    });
  }

  if (capabilities.inventory) {
    cards.push({
      label: 'Inventario disponible',
      value: formatCount(kpis.availableInventory),
      hint: 'Piezas disponibles + unidades de cantidad libres',
      to: OPERATIONAL_HREFS.inventoryAvailable,
    });
  }

  if (capabilities.workOrders && kpis.workOrdersInProgress != null && can(user, 'workOrders.manage')) {
    cards.push({
      label: 'Órdenes en proceso',
      value: formatCount(kpis.workOrdersInProgress),
      hint: `Cualquier tipo de ${UX_TERMS.workOrder.toLowerCase()} activa`,
      to: OPERATIONAL_HREFS.workOrdersInProgress,
    });
  }

  const profitHidden = !capabilities.profitability || kpis.profitDop == null || !can(user, 'profit.view');
  if (profitHidden && capabilities.sales) {
    cards.push({
      label: 'Borradores',
      value: formatCount(kpis.draftCount),
      hint: 'Ventas sin confirmar',
      to: OPERATIONAL_HREFS.salesDrafts,
    });
  }

  return cards;
}

function buildFinanceKpis(
  kpis: DashboardKpis,
  capabilities: AppCapabilities,
  user: Pick<User, 'role' | 'active'> | null,
): DashboardKpiCard[] {
  const cards: DashboardKpiCard[] = [];

  if (capabilities.payments) {
    cards.push({
      label: 'Saldo pendiente',
      value: money(kpis.outstandingDop, 'DOP'),
      hint:
        kpis.outstandingUsd > 0
          ? `Dólares pendientes: ${money(kpis.outstandingUsd, 'USD')}`
          : 'Facturas completadas sin saldar',
      tone: kpis.outstandingDop > 0 ? 'amber' : 'default',
      to: OPERATIONAL_HREFS.salesOutstanding,
    });
  }

  if (capabilities.profitability && kpis.profitDop != null && can(user, 'profit.view')) {
    cards.push({
      label: 'Ganancia bruta en pesos',
      value: money(kpis.profitDop, 'DOP'),
      hint: 'Solo administrador · dólares convertidos a pesos con su tasa',
      tone: 'brand',
      to: OPERATIONAL_HREFS.profitability,
    });
  }

  if (capabilities.payments) {
    cards.push({
      label: 'Cobros',
      value: 'Historial',
      hint: 'Facturas pagadas o con pago parcial',
      to: OPERATIONAL_HREFS.salesPayments,
    });
  }

  return cards;
}

export function DashboardPage() {
  const query = useDashboard();
  const capabilities = useAppCapabilities();
  const { user } = useAuth();

  if (query.status === 'loading') {
    return <Skeleton label="Cargando inicio" variant="cards" lines={8} />;
  }

  if (query.status === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar el inicio">
        {toPageLoadMessage(query.error.message, 'No pudimos cargar el inicio.')}
      </Info>
    );
  }

  const { snapshot } = query;
  const isAdmin = snapshot.kpis.profitDop != null;
  const attention = buildAttentionKpis(snapshot.kpis, capabilities, user);
  const today = buildTodayKpis(snapshot.kpis, capabilities, user);
  const finance = buildFinanceKpis(snapshot.kpis, capabilities, user);

  return (
    <>
      <PageHeader
        title="Inicio"
        description={
          isAdmin
            ? 'Atención, operación del día y finanzas.'
            : 'Resumen de inventario, ventas y cobros.'
        }
      />

      <div className="space-y-8">
        {capabilities.hierarchy &&
          snapshot.pendingCatalogReviews &&
          snapshot.pendingCatalogReviews.length > 0 && (
          <CatalogReviewBanner reviews={snapshot.pendingCatalogReviews} />
        )}
        <KpiSection
          title="Necesita atención"
          subtitle="Cola de trabajo que conviene resolver primero"
          cards={attention}
        />
        <KpiSection title="Operación de hoy" cards={today} />
        <KpiSection title="Finanzas" cards={finance} />

        <div className="grid gap-8 lg:grid-cols-5">
          {capabilities.sales && (
            <div className="lg:col-span-3">
              <RecentInvoicesList invoices={snapshot.recentInvoices} />
            </div>
          )}
          <div className={capabilities.sales ? 'lg:col-span-2' : 'lg:col-span-5'}>
            <ActivityTimeline events={snapshot.activity} />
          </div>
        </div>
      </div>
    </>
  );
}
