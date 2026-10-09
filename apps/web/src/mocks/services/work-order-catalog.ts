import type {
  AppState,
  MechanicWorkOrderView,
  User,
  WorkOrder,
  WorkOrderStatus,
} from '../../api/contracts/entities';
import type {
  WorkOrderCreateOptions,
  WorkOrderDetailView,
  WorkOrderListRow,
  WorkOrderListTab,
  WorkOrderPieceOption,
} from '../../api/contracts/work-orders';
import { can } from '../../shared/auth/policies';
import { toHistoryEventView } from './history-view';
import {
  effectiveLocation,
  isAssemblyItem,
  itemById,
  protectedAncestor,
} from './inventory-helpers';

function itemName(state: AppState, id: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }
  return state.items.find((item) => item.id === id)?.name ?? id;
}

function mechanicName(state: AppState, id: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }
  return state.users.find((user) => user.id === id)?.name ?? id;
}

function invoiceNumber(state: AppState, invoiceId: string | undefined): string | undefined {
  if (!invoiceId) {
    return undefined;
  }
  const invoice = state.invoices.find((entry) => entry.id === invoiceId);
  return invoice?.number ?? invoiceId;
}

function hasActiveWorkOrder(state: AppState, pieceId: string): boolean {
  return state.workOrders.some(
    (order) =>
      order.pieceId === pieceId && (order.status === 'PENDING' || order.status === 'IN_PROGRESS'),
  );
}

function toPieceOption(item: {
  id: string;
  name: string;
  parentId?: string;
}): WorkOrderPieceOption {
  return {
    id: item.id,
    name: item.name,
    parentId: item.parentId,
  };
}

export function matchesWorkOrderTab(order: WorkOrder, tab: WorkOrderListTab): boolean {
  if (tab === 'ALL') {
    return true;
  }
  return order.status === tab;
}

export function toWorkOrderListRow(state: AppState, order: WorkOrder): WorkOrderListRow {
  return {
    id: order.id,
    type: order.type,
    status: order.status,
    pieceId: order.pieceId,
    pieceName: itemName(state, order.pieceId) ?? order.pieceId,
    sourceParentId: order.sourceParentId,
    sourceParentName: itemName(state, order.sourceParentId),
    destinationParentId: order.destinationParentId,
    destinationParentName: itemName(state, order.destinationParentId),
    assignedMechanicId: order.assignedMechanicId,
    assignedMechanicName: mechanicName(state, order.assignedMechanicId),
    invoiceId: order.invoiceId,
    invoiceNumber: invoiceNumber(state, order.invoiceId),
    createdAt: order.createdAt,
    href: `/work-orders/${order.id}`,
  };
}

export function buildWorkOrderList(
  state: AppState,
  tab: WorkOrderListTab = 'ALL',
): WorkOrderListRow[] {
  return [...state.workOrders]
    .filter((order) => matchesWorkOrderTab(order, tab))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((order) => toWorkOrderListRow(state, order));
}

function isLinkedWorkOrderEvent(event: AppState['events'][number], order: WorkOrder): boolean {
  if (event.metadata?.workOrderId === order.id) {
    return true;
  }
  return event.description.includes(order.id);
}

export function buildWorkOrderDetail(
  state: AppState,
  order: WorkOrder,
  actor: User,
): WorkOrderDetailView {
  const active = order.status === 'PENDING' || order.status === 'IN_PROGRESS';

  return {
    ...toWorkOrderListRow(state, order),
    notes: order.notes,
    beforePhotos: [...order.beforePhotos],
    afterPhotos: [...order.afterPhotos],
    cancelReason: order.cancelReason,
    history: state.events
      .filter((event) => isLinkedWorkOrderEvent(event, order))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((event) => toHistoryEventView(event, state.users)),
    actions: {
      canReassign: active && can(actor, 'workOrders.manage'),
      canCancel: active && can(actor, 'workOrders.manage'),
    },
  };
}

export function buildWorkOrderCreateOptions(state: AppState): WorkOrderCreateOptions {
  const dismantlingPieces = state.items
    .filter((item) => {
      if (item.physicalRelationship !== 'INSTALLED' || !item.parentId) {
        return false;
      }
      if (hasActiveWorkOrder(state, item.id)) {
        return false;
      }
      const restriction = protectedAncestor(state.items, item);
      if (restriction && restriction.id !== item.id) {
        return false;
      }
      return true;
    })
    .map(toPieceOption);

  const installationPieces = state.items
    .filter(
      (item) => item.physicalRelationship === 'INDEPENDENT' && !hasActiveWorkOrder(state, item.id),
    )
    .map(toPieceOption);

  const destinations = state.items
    .filter((item) => isAssemblyItem(item, state.categories))
    .map(toPieceOption);

  const mechanics = state.users
    .filter((user) => user.role === 'MECHANIC' && user.active)
    .map((user) => ({ id: user.id, name: user.name }));

  return { dismantlingPieces, installationPieces, destinations, mechanics };
}

export function findWorkOrder(state: AppState, id: string): WorkOrder | undefined {
  return state.workOrders.find((order) => order.id === id);
}

export function isActiveStatus(status: WorkOrderStatus): boolean {
  return status === 'PENDING' || status === 'IN_PROGRESS';
}

function hasRequiredEvidence(order: WorkOrder): boolean {
  return order.beforePhotos.length > 0 && order.afterPhotos.length > 0;
}

export function isAssignedTo(order: WorkOrder, mechanicId: string): boolean {
  return order.assignedMechanicId === mechanicId;
}

/**
 * Pending queue plus this mechanic's assigned work (WO-003 / WO-004).
 * CANCELLED is visible only if they had the order; cancelled-before-take stays hidden.
 */
export function isVisibleToMechanic(order: WorkOrder, mechanicId: string): boolean {
  if (order.status === 'PENDING') {
    return true;
  }
  return isAssignedTo(order, mechanicId);
}

export function toMechanicWorkOrderView(
  state: AppState,
  order: WorkOrder,
  actor: User,
): MechanicWorkOrderView {
  const piece = itemById(state.items, order.pieceId);
  const assigned = isAssignedTo(order, actor.id);
  const inProgress = order.status === 'IN_PROGRESS' && assigned;

  return {
    id: order.id,
    type: order.type,
    status: order.status,
    pieceId: order.pieceId,
    pieceName: piece?.name ?? order.pieceId,
    sourceParentId: order.sourceParentId,
    sourceParentName: itemName(state, order.sourceParentId),
    destinationParentId: order.destinationParentId,
    destinationParentName: itemName(state, order.destinationParentId),
    assignedMechanicId: order.assignedMechanicId,
    assignedMechanicName: mechanicName(state, order.assignedMechanicId),
    effectiveLocation: piece ? effectiveLocation(state.items, piece) : undefined,
    notes: order.notes,
    beforePhotos: [...order.beforePhotos],
    afterPhotos: [...order.afterPhotos],
    href: `/mechanic/orders/${order.id}`,
    actions: {
      canTake: order.status === 'PENDING' && !order.assignedMechanicId,
      canAddEvidence: inProgress,
      canComplete: inProgress && hasRequiredEvidence(order),
    },
  };
}

export function buildMechanicWorkOrderList(state: AppState, actor: User): MechanicWorkOrderView[] {
  return [...state.workOrders]
    .filter((order) => isVisibleToMechanic(order, actor.id))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((order) => toMechanicWorkOrderView(state, order, actor));
}
