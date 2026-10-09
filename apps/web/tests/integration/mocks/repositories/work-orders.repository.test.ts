import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mockWorkOrderRepository } from '../../../../src/mocks/repositories/MockWorkOrderRepository';
import { getMockState, resetMockState } from '../../../../src/mocks/state';
import { signInAs } from '../../../support/session';

describe('MockWorkOrderRepository', () => {
  beforeEach(() => {
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('lists seed work orders for an administrator', async () => {
    signInAs('ADMINISTRATOR');

    const result = await mockWorkOrderRepository.list();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((row) => row.id).sort()).toEqual([
        'OD-DEMO-060',
        'OD-DEMO-061',
        'OD-DEMO-062',
        'OD-DEMO-063',
      ]);
    }
  });

  it('denies seller list, create, reassign and cancel', async () => {
    signInAs('SELLER');

    const listed = await mockWorkOrderRepository.list();
    const created = await mockWorkOrderRepository.createManual({
      pieceId: 'MOT-001',
      type: 'DISMANTLING',
    });
    const reassigned = await mockWorkOrderRepository.reassign({
      workOrderId: 'OD-DEMO-061',
      mechanicId: 'U-PEDRO',
      reason: 'No debería',
    });
    const cancelled = await mockWorkOrderRepository.cancel({
      workOrderId: 'OD-DEMO-062',
      reason: 'No debería',
    });

    expect(listed.ok).toBe(false);
    expect(created.ok).toBe(false);
    expect(reassigned.ok).toBe(false);
    expect(cancelled.ok).toBe(false);
    if (!listed.ok) {
      expect(listed.error.code).toBe('FORBIDDEN');
    }
  });

  it('creates a pending dismantling without changing hierarchy', async () => {
    signInAs('ADMINISTRATOR');

    const result = await mockWorkOrderRepository.createManual({
      pieceId: 'MOT-001',
      type: 'DISMANTLING',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PENDING');
    }
    const piece = getMockState().items.find((item) => item.id === 'MOT-001');
    expect(piece?.parentId).toBe('CAM-001');
    expect(piece?.physicalRelationship).toBe('INSTALLED');
  });

  it('reassigns and cancels with history events', async () => {
    signInAs('ADMINISTRATOR');

    const reassigned = await mockWorkOrderRepository.reassign({
      workOrderId: 'OD-DEMO-061',
      mechanicId: 'U-PEDRO',
      reason: 'Cobertura',
    });
    const cancelled = await mockWorkOrderRepository.cancel({
      workOrderId: 'OD-DEMO-062',
      reason: 'Cambio de plan',
    });

    expect(reassigned.ok).toBe(true);
    expect(cancelled.ok).toBe(true);

    const state = getMockState();
    expect(state.workOrders.find((order) => order.id === 'OD-DEMO-061')?.assignedMechanicId).toBe(
      'U-PEDRO',
    );
    expect(state.workOrders.find((order) => order.id === 'OD-DEMO-062')?.status).toBe('CANCELLED');
    expect(state.events.some((event) => event.type === 'WORK_ORDER_REASSIGNED')).toBe(true);
    expect(state.events.some((event) => event.type === 'WORK_ORDER_CANCELLED')).toBe(true);
  });

  it('lets a mechanic get own IN_PROGRESS and PENDING, but not another mechanic IN_PROGRESS', async () => {
    signInAs('MECHANIC');

    const ownInProgress = await mockWorkOrderRepository.getForMechanic('OD-DEMO-060');
    const pending = await mockWorkOrderRepository.getForMechanic('OD-DEMO-061');

    const otherMechanicOrder = getMockState().workOrders.find(
      (order) => order.id === 'OD-DEMO-060',
    );
    expect(otherMechanicOrder).toBeDefined();
    otherMechanicOrder!.assignedMechanicId = 'U-CARLOS';
    const otherInProgress = await mockWorkOrderRepository.getForMechanic('OD-DEMO-060');

    expect(ownInProgress.ok).toBe(true);
    expect(pending.ok).toBe(true);
    expect(otherInProgress.ok).toBe(false);
    if (!otherInProgress.ok) {
      expect(otherInProgress.error.code).toBe('NOT_FOUND');
      expect(otherInProgress.error.message).toBe('Orden de trabajo no encontrada');
    }
  });

  it('lets a mechanic take a pending order and denies a second claim', async () => {
    signInAs('MECHANIC');

    const queue = await mockWorkOrderRepository.listForMechanic();
    const listed = await mockWorkOrderRepository.list();
    const taken = await mockWorkOrderRepository.takeOrder('OD-DEMO-061');
    const again = await mockWorkOrderRepository.takeOrder('OD-DEMO-061');

    expect(queue.ok).toBe(true);
    expect(listed.ok).toBe(false);
    expect(taken.ok).toBe(true);
    expect(again.ok).toBe(false);
    if (queue.ok) {
      expect(queue.value[0]).not.toHaveProperty('invoiceId');
      expect(queue.value[0]).not.toHaveProperty('invoiceNumber');
    }
    if (taken.ok) {
      expect(taken.value.status).toBe('IN_PROGRESS');
      expect(taken.value.assignedMechanicId).toBe('U-PEDRO');
      expect(taken.value).not.toHaveProperty('invoiceId');
    }
  });

  it('lets the assigned mechanic complete dismantling after evidence', async () => {
    signInAs('MECHANIC');

    const missing = await mockWorkOrderRepository.completeDesarme({ workOrderId: 'OD-DEMO-060' });
    expect(missing.ok).toBe(false);

    const after = await mockWorkOrderRepository.addPhoto({
      workOrderId: 'OD-DEMO-060',
      kind: 'AFTER',
      fileName: 'after-turbo.jpg',
    });
    const completed = await mockWorkOrderRepository.completeDesarme({
      workOrderId: 'OD-DEMO-060',
      location: 'Patio D',
    });

    expect(after.ok).toBe(true);
    expect(completed.ok).toBe(true);

    const turbo = getMockState().items.find((item) => item.id === 'TUR-009');
    expect(turbo?.commercialState).toBe('SOLD');
    expect(turbo?.physicalRelationship).toBe('INDEPENDENT');
  });

  it('denies seller take and complete', async () => {
    signInAs('SELLER');

    const taken = await mockWorkOrderRepository.takeOrder('OD-DEMO-061');
    const completed = await mockWorkOrderRepository.completeDesarme({ workOrderId: 'OD-DEMO-060' });

    expect(taken.ok).toBe(false);
    expect(completed.ok).toBe(false);
  });

  it('returns defensive copies for list reads', async () => {
    signInAs('ADMINISTRATOR');

    const first = await mockWorkOrderRepository.list();
    expect(first.ok).toBe(true);
    if (first.ok) {
      first.value[0]!.pieceName = 'Mutación externa';
    }

    const second = await mockWorkOrderRepository.list();
    expect(second.ok && second.value[0]?.pieceName).not.toBe('Mutación externa');
  });
});
