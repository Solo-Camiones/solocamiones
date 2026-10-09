import type { User, WorkOrder } from '../../api/contracts/entities';
import type { WorkOrderRepository } from '../../api/contracts/repositories';
import type {
  AddWorkOrderPhotoInput,
  CancelWorkOrderInput,
  CompleteWorkOrderInput,
  CreateManualWorkOrderInput,
  ReassignWorkOrderInput,
  WorkOrderListTab,
} from '../../api/contracts/work-orders';
import { err, ok, type Result } from '../../shared/auth/types';
import { createManualWorkOrder } from '../services/inventory-commands';
import { requirePermission } from '../services/require-permission';
import {
  buildMechanicWorkOrderList,
  buildWorkOrderCreateOptions,
  buildWorkOrderDetail,
  buildWorkOrderList,
  findWorkOrder,
  isVisibleToMechanic,
  toMechanicWorkOrderView,
} from '../services/work-order-catalog';
import {
  addPhoto,
  cancelOrder,
  completeDesarme,
  completeInstalacion,
  reassignOrder,
  takeOrder,
} from '../services/work-order-commands';
import { cloneForRead, getMockState } from '../state';

function mechanicView(actor: User, result: Result<WorkOrder>) {
  if (!result.ok) {
    return result;
  }

  return ok(cloneForRead(toMechanicWorkOrderView(getMockState(), result.value, actor)));
}

export class MockWorkOrderRepository implements WorkOrderRepository {
  async list(tab: WorkOrderListTab = 'ALL') {
    const permission = requirePermission('workOrders.manage');
    if (!permission.ok) {
      return permission;
    }

    return ok(cloneForRead(buildWorkOrderList(getMockState(), tab)));
  }

  async getById(id: string) {
    const permission = requirePermission('workOrders.manage');
    if (!permission.ok) {
      return permission;
    }

    const order = findWorkOrder(getMockState(), id);
    if (!order) {
      return err({ code: 'NOT_FOUND', message: 'Orden de trabajo no encontrada' });
    }

    return ok(cloneForRead(buildWorkOrderDetail(getMockState(), order, permission.value)));
  }

  async listForMechanic() {
    const permission = requirePermission('workOrders.take');
    if (!permission.ok) {
      return permission;
    }

    return ok(cloneForRead(buildMechanicWorkOrderList(getMockState(), permission.value)));
  }

  async getForMechanic(id: string) {
    const permission = requirePermission('workOrders.take');
    if (!permission.ok) {
      return permission;
    }

    const order = findWorkOrder(getMockState(), id);
    if (!order || !isVisibleToMechanic(order, permission.value.id)) {
      return err({ code: 'NOT_FOUND', message: 'Orden de trabajo no encontrada' });
    }

    return ok(cloneForRead(toMechanicWorkOrderView(getMockState(), order, permission.value)));
  }

  async getCreateOptions() {
    const permission = requirePermission('workOrders.manage');
    if (!permission.ok) {
      return permission;
    }

    return ok(cloneForRead(buildWorkOrderCreateOptions(getMockState())));
  }

  async createManual(input: CreateManualWorkOrderInput) {
    const permission = requirePermission('workOrders.manage');
    if (!permission.ok) {
      return permission;
    }

    const result = createManualWorkOrder(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    return ok(cloneForRead(buildWorkOrderDetail(getMockState(), result.value, permission.value)));
  }

  async reassign(input: ReassignWorkOrderInput) {
    const permission = requirePermission('workOrders.manage');
    if (!permission.ok) {
      return permission;
    }

    const result = reassignOrder(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    return ok(cloneForRead(buildWorkOrderDetail(getMockState(), result.value, permission.value)));
  }

  async cancel(input: CancelWorkOrderInput) {
    const permission = requirePermission('workOrders.manage');
    if (!permission.ok) {
      return permission;
    }

    const result = cancelOrder(getMockState(), permission.value, input);
    if (!result.ok) {
      return result;
    }

    return ok(cloneForRead(buildWorkOrderDetail(getMockState(), result.value, permission.value)));
  }

  async takeOrder(workOrderId: string) {
    const permission = requirePermission('workOrders.take');
    if (!permission.ok) {
      return permission;
    }

    return mechanicView(permission.value, takeOrder(getMockState(), permission.value, workOrderId));
  }

  async addPhoto(input: AddWorkOrderPhotoInput) {
    const permission = requirePermission('workOrders.complete');
    if (!permission.ok) {
      return permission;
    }

    return mechanicView(permission.value, addPhoto(getMockState(), permission.value, input));
  }

  async completeDesarme(input: CompleteWorkOrderInput) {
    const permission = requirePermission('workOrders.complete');
    if (!permission.ok) {
      return permission;
    }

    return mechanicView(permission.value, completeDesarme(getMockState(), permission.value, input));
  }

  async completeInstalacion(input: CompleteWorkOrderInput) {
    const permission = requirePermission('workOrders.complete');
    if (!permission.ok) {
      return permission;
    }

    return mechanicView(
      permission.value,
      completeInstalacion(getMockState(), permission.value, input),
    );
  }
}

export const mockWorkOrderRepository = new MockWorkOrderRepository();
