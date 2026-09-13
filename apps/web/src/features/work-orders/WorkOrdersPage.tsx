import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import type { WorkOrderType } from '../../api/contracts/entities';
import type { CreateManualWorkOrderInput, WorkOrderListTab } from '../../api/contracts/work-orders';
import { can } from '../../shared/auth/policies';
import { UX_TERMS } from '../../shared/copy/glossary';
import { Button, Chip, Info, Skeleton, toPageLoadMessage } from '../../shared/ui';
import { PageHeader } from '../../shared/layout/PageHeader';
import { TabBar } from '../../shared/layout/TabBar';
import { useAuth } from '../auth/useAuth';
import { CreateWorkOrderModal } from './CreateWorkOrderModal';
import { WorkOrderTable } from './WorkOrderTable';
import { useWorkOrders } from './useWorkOrders';

const TABS: { id: WorkOrderListTab; label: string }[] = [
  { id: 'ALL', label: 'Todas' },
  { id: 'PENDING', label: 'Pendiente' },
  { id: 'IN_PROGRESS', label: 'En proceso' },
  { id: 'COMPLETED', label: 'Completada' },
  { id: 'CANCELLED', label: 'Cancelada' },
];

const WORK_ORDER_TABS: WorkOrderListTab[] = [
  'ALL',
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

function parseWorkOrderTab(value: string | null): WorkOrderListTab | null {
  if (value && WORK_ORDER_TABS.includes(value as WorkOrderListTab)) {
    return value as WorkOrderListTab;
  }
  return null;
}

function parseWorkOrderType(value: string | null): WorkOrderType | null {
  if (value === 'DISMANTLING' || value === 'INSTALLATION') {
    return value;
  }
  return null;
}

function workOrderTypeLabel(type: WorkOrderType): string {
  return type === 'DISMANTLING' ? UX_TERMS.dismantling : 'Instalación';
}

export function WorkOrdersPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseWorkOrderTab(searchParams.get('status')) ?? 'ALL';
  const typeFilter = parseWorkOrderType(searchParams.get('type'));
  const { result, createOptions, isMutating, createManual } = useWorkOrders(tab);
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const canManageWorkOrders = can(user, 'workOrders.manage');
  const visibleRows = useMemo(() => {
    if (result.status !== 'ready') {
      return [];
    }
    if (!typeFilter) {
      return result.rows;
    }
    return result.rows.filter((row) => row.type === typeFilter);
  }, [result, typeFilter]);

  function handleTabChange(next: WorkOrderListTab) {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (next === 'ALL') {
          nextParams.delete('status');
        } else {
          nextParams.set('status', next);
        }
        return nextParams;
      },
      { replace: true },
    );
  }

  function clearTypeFilter() {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        nextParams.delete('type');
        return nextParams;
      },
      { replace: true },
    );
  }

  function closeModal() {
    if (isMutating) {
      return;
    }
    setModalOpen(false);
    setFormError(null);
  }

  async function handleSubmit(input: CreateManualWorkOrderInput) {
    setFormError(null);
    const response = await createManual(input);
    if (!response.ok) {
      setFormError(response.error.message);
      return;
    }
    setModalOpen(false);
    navigate(`/work-orders/${response.value}`);
  }

  if (result.status === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar las órdenes de trabajo">
        {toPageLoadMessage(result.error.message, 'No pudimos cargar las órdenes de trabajo.')}
      </Info>
    );
  }

  return (
    <>
      <PageHeader
        title="Órdenes de Trabajo"
        description={`Órdenes de ${UX_TERMS.dismantling.toLowerCase()} e instalación.`}
        actions={
          canManageWorkOrders ? (
            <Button
              onClick={() => {
                setFormError(null);
                setModalOpen(true);
              }}
              disabled={result.status === 'loading'}
            >
              Nueva orden de trabajo
            </Button>
          ) : undefined
        }
      />

      {typeFilter && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Chip tone="brand">Tipo: {workOrderTypeLabel(typeFilter)}</Chip>
          <Button variant="ghost" size="sm" onClick={clearTypeFilter}>
            Quitar filtro
          </Button>
        </div>
      )}

      <TabBar tabs={TABS} value={tab} onChange={handleTabChange} aria-label="Estado de la orden" />

      {result.status === 'loading' ? (
        <Skeleton label="Cargando órdenes" />
      ) : (
        <WorkOrderTable rows={visibleRows} />
      )}

      {canManageWorkOrders && (
        <CreateWorkOrderModal
          open={modalOpen}
          options={createOptions}
          isSaving={isMutating}
          error={formError}
          onClose={closeModal}
          onSubmit={(input) => {
            void handleSubmit(input);
          }}
        />
      )}
    </>
  );
}
