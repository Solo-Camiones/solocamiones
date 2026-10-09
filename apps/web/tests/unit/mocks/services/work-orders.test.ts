import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../../../src/mocks/data/seed';
import { createManualWorkOrder } from '../../../../src/mocks/services/inventory-commands';
import {
  addPhoto,
  cancelOrder,
  completeDesarme,
  completeInstalacion,
  createInstalacion,
  createManualDesarme,
  reassignOrder,
  takeOrder,
} from '../../../../src/mocks/services/work-order-commands';
import {
  buildMechanicWorkOrderList,
  buildWorkOrderCreateOptions,
  buildWorkOrderList,
  toMechanicWorkOrderView,
} from '../../../../src/mocks/services/work-order-catalog';

const ADMIN = {
  id: 'U-ADMIN',
  name: 'Administrador Demo',
  username: 'admin',
  password: 'demo1234',
  role: 'ADMINISTRATOR' as const,
  active: true,
};

describe('work order catalog and commands', () => {
  it('projects seed orders with the expected statuses, types and links', () => {
    const rows = buildWorkOrderList(createInitialState());
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

    expect(rows).toHaveLength(4);
    expect(byId['OD-DEMO-060']).toMatchObject({
      type: 'DISMANTLING',
      status: 'IN_PROGRESS',
      pieceId: 'TUR-009',
      sourceParentId: 'MOT-001',
      assignedMechanicName: 'Pedro Santana',
      invoiceNumber: 'FAC-000096',
    });
    expect(byId['OD-DEMO-061']).toMatchObject({
      status: 'PENDING',
      assignedMechanicName: undefined,
      invoiceNumber: 'FAC-000098',
    });
    expect(byId['OD-DEMO-062']).toMatchObject({
      type: 'INSTALLATION',
      status: 'PENDING',
      destinationParentId: 'MOT-002',
    });
    expect(byId['OD-DEMO-063']).toMatchObject({
      status: 'COMPLETED',
      assignedMechanicName: 'Carlos Méndez',
    });
  });

  it('creates a pending dismantling without changing hierarchy', () => {
    const state = createInitialState();
    const piece = state.items.find((item) => item.id === 'MOT-001')!;
    const parentId = piece.parentId;
    const relationship = piece.physicalRelationship;

    const result = createManualDesarme(state, ADMIN, { pieceId: 'MOT-001' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe('PENDING');
    expect(result.value.sourceParentId).toBe('CAM-001');
    expect(piece.parentId).toBe(parentId);
    expect(piece.physicalRelationship).toBe(relationship);
    expect(
      state.events.some(
        (event) =>
          event.type === 'WORK_ORDER_CREATED' && event.metadata?.workOrderId === result.value.id,
      ),
    ).toBe(true);
  });

  it('creates a pending installation without attaching the piece yet', () => {
    const state = createInitialState();
    const piece = state.items.find((item) => item.id === 'ALT-010')!;

    const result = createInstalacion(state, ADMIN, {
      pieceId: 'ALT-010',
      destinationParentId: 'MOT-002',
    });

    expect(result.ok).toBe(true);
    expect(piece.physicalRelationship).toBe('INDEPENDENT');
    expect(piece.parentId).toBeUndefined();
  });

  it('reassigns a pending order to an active mechanic and records history', () => {
    const state = createInitialState();
    const result = reassignOrder(state, ADMIN, {
      workOrderId: 'OD-DEMO-061',
      mechanicId: 'U-PEDRO',
      reason: 'Cobertura de patio',
    });

    expect(result.ok).toBe(true);
    const order = state.workOrders.find((entry) => entry.id === 'OD-DEMO-061');
    expect(order?.assignedMechanicId).toBe('U-PEDRO');
    expect(order?.status).toBe('IN_PROGRESS');
    expect(
      state.events.some(
        (event) =>
          event.type === 'WORK_ORDER_REASSIGNED' &&
          event.metadata?.workOrderId === 'OD-DEMO-061' &&
          event.metadata?.reason === 'Cobertura de patio',
      ),
    ).toBe(true);
  });

  it('rejects reassignment to an inactive mechanic or a completed order', () => {
    const state = createInitialState();

    const inactive = reassignOrder(state, ADMIN, {
      workOrderId: 'OD-DEMO-061',
      mechanicId: 'U-CARLOS',
      reason: 'Intento',
    });
    const completed = reassignOrder(state, ADMIN, {
      workOrderId: 'OD-DEMO-063',
      mechanicId: 'U-PEDRO',
      reason: 'Intento',
    });

    expect(inactive.ok).toBe(false);
    expect(completed.ok).toBe(false);
  });

  it('cancels a pending order with reason and leaves inventory untouched', () => {
    const state = createInitialState();
    const piece = state.items.find((item) => item.id === 'FIL-001')!;
    const relationship = piece.physicalRelationship;

    const result = cancelOrder(state, ADMIN, {
      workOrderId: 'OD-DEMO-062',
      reason: 'Ya no aplica instalar',
    });

    expect(result.ok).toBe(true);
    expect(state.workOrders.find((order) => order.id === 'OD-DEMO-062')?.status).toBe('CANCELLED');
    expect(piece.physicalRelationship).toBe(relationship);
    expect(
      state.events.some(
        (event) =>
          event.type === 'WORK_ORDER_CANCELLED' && event.metadata?.workOrderId === 'OD-DEMO-062',
      ),
    ).toBe(true);
  });

  it('requires physical verification to cancel an in-progress order', () => {
    const state = createInitialState();

    const rejected = cancelOrder(state, ADMIN, {
      workOrderId: 'OD-DEMO-060',
      reason: 'Abandono',
    });
    const accepted = cancelOrder(state, ADMIN, {
      workOrderId: 'OD-DEMO-060',
      reason: 'Abandono verificado',
      physicalVerified: true,
    });

    expect(rejected.ok).toBe(false);
    expect(accepted.ok).toBe(true);
  });

  it('rejects cancelling a completed order', () => {
    const state = createInitialState();
    const result = cancelOrder(state, ADMIN, {
      workOrderId: 'OD-DEMO-063',
      reason: 'Borrar historial',
    });
    expect(result.ok).toBe(false);
    expect(state.workOrders.find((order) => order.id === 'OD-DEMO-063')?.status).toBe('COMPLETED');
  });

  it('omits pieces with an active order from create options', () => {
    const options = buildWorkOrderCreateOptions(createInitialState());
    const dismantlingIds = options.dismantlingPieces.map((piece) => piece.id);
    const installationIds = options.installationPieces.map((piece) => piece.id);

    expect(dismantlingIds).not.toContain('TUR-009');
    expect(dismantlingIds).not.toContain('ARR-002');
    expect(installationIds).not.toContain('FIL-001');
    expect(options.mechanics.map((mechanic) => mechanic.id)).toEqual(['U-PEDRO']);
  });

  it('still uses the shared createManualWorkOrder path for inventory actions', () => {
    const state = createInitialState();
    const result = createManualWorkOrder(state, ADMIN, {
      pieceId: 'MOT-001',
      type: 'DISMANTLING',
    });
    expect(result.ok).toBe(true);
  });
});

const PEDRO = {
  id: 'U-PEDRO',
  name: 'Pedro Santana',
  username: 'pedro',
  password: 'demo1234',
  role: 'MECHANIC' as const,
  active: true,
};

const CARLOS = {
  id: 'U-CARLOS',
  name: 'Carlos Méndez',
  username: 'carlos',
  password: 'demo1234',
  role: 'MECHANIC' as const,
  active: true,
};

describe('mechanic take, evidence and completion', () => {
  it('assigns a pending order to the first mechanic and rejects a second claim', () => {
    const state = createInitialState();

    const first = takeOrder(state, PEDRO, 'OD-DEMO-061');
    const second = takeOrder(state, CARLOS, 'OD-DEMO-061');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(state.workOrders.find((order) => order.id === 'OD-DEMO-061')?.assignedMechanicId).toBe(
      'U-PEDRO',
    );
    expect(state.workOrders.find((order) => order.id === 'OD-DEMO-061')?.status).toBe(
      'IN_PROGRESS',
    );
  });

  it('rejects take when the order is already in progress', () => {
    const result = takeOrder(createInitialState(), PEDRO, 'OD-DEMO-060');
    expect(result.ok).toBe(false);
  });

  it('rejects take from a non-mechanic even if the policy layer would allow it', () => {
    const result = takeOrder(createInitialState(), ADMIN, 'OD-DEMO-061');
    expect(result.ok).toBe(false);
  });

  it('denies evidence and completion to a mechanic who does not own the order', () => {
    const state = createInitialState();

    const photo = addPhoto(state, CARLOS, {
      workOrderId: 'OD-DEMO-060',
      kind: 'AFTER',
      fileName: 'after-other.jpg',
    });
    const completed = completeDesarme(state, CARLOS, { workOrderId: 'OD-DEMO-060' });

    expect(photo.ok).toBe(false);
    expect(completed.ok).toBe(false);
    expect(state.workOrders.find((order) => order.id === 'OD-DEMO-060')?.afterPhotos).toEqual([]);
  });

  it('rejects completion without BEFORE and AFTER evidence', () => {
    const state = createInitialState();
    const result = completeDesarme(state, PEDRO, { workOrderId: 'OD-DEMO-060' });
    expect(result.ok).toBe(false);
    expect(state.workOrders.find((order) => order.id === 'OD-DEMO-060')?.status).toBe(
      'IN_PROGRESS',
    );
  });

  it('completes dismantling with an explicit or pending post-removal location', () => {
    const state = createInitialState();
    const truckComplete = state.items.find((item) => item.id === 'CAM-001')?.complete;
    const missingOnTruck = state.knownMissing.filter(
      (entry) => entry.parentId === 'CAM-001',
    ).length;

    expect(
      addPhoto(state, PEDRO, {
        workOrderId: 'OD-DEMO-060',
        kind: 'AFTER',
        fileName: 'after-turbo.jpg',
      }).ok,
    ).toBe(true);

    const result = completeDesarme(state, PEDRO, {
      workOrderId: 'OD-DEMO-060',
      location: 'Patio D',
    });

    expect(result.ok).toBe(true);
    const turbo = state.items.find((item) => item.id === 'TUR-009')!;
    const engine = state.items.find((item) => item.id === 'MOT-001')!;
    expect(turbo.commercialState).toBe('SOLD');
    expect(turbo.physicalRelationship).toBe('INDEPENDENT');
    expect(turbo.parentId).toBeUndefined();
    expect(turbo.location).toBe('Patio D');
    expect(engine.complete).toBe(false);
    expect(
      state.knownMissing.some(
        (entry) =>
          entry.parentId === 'MOT-001' &&
          entry.formerItemId === 'TUR-009' &&
          entry.origin === 'REMOVED_AFTER_BASELINE',
      ),
    ).toBe(true);
    expect(state.items.find((item) => item.id === 'CAM-001')?.complete).toBe(truckComplete);
    expect(state.knownMissing.filter((entry) => entry.parentId === 'CAM-001')).toHaveLength(
      missingOnTruck,
    );

    const pendingLocationState = createInitialState();
    const pendingLocationTurbo = pendingLocationState.items.find((item) => item.id === 'TUR-009')!;
    pendingLocationTurbo.location = 'Ubicación anterior';
    expect(
      addPhoto(pendingLocationState, PEDRO, {
        workOrderId: 'OD-DEMO-060',
        kind: 'AFTER',
        fileName: 'after-turbo.jpg',
      }).ok,
    ).toBe(true);
    expect(completeDesarme(pendingLocationState, PEDRO, { workOrderId: 'OD-DEMO-060' }).ok).toBe(
      true,
    );
    expect(pendingLocationTurbo.location).toBeUndefined();
  });

  it('rejects dismantling completion under No desarmar', () => {
    const state = createInitialState();
    state.workOrders.push({
      id: 'OD-DEMO-070',
      type: 'DISMANTLING',
      status: 'IN_PROGRESS',
      pieceId: 'ALT-011',
      sourceParentId: 'MOT-003',
      assignedMechanicId: 'U-PEDRO',
      beforePhotos: ['before.jpg'],
      afterPhotos: ['after.jpg'],
      createdAt: '2026-08-25T16:00:00.000Z',
    });

    const result = completeDesarme(state, PEDRO, { workOrderId: 'OD-DEMO-070' });
    expect(result.ok).toBe(false);
    expect(state.items.find((item) => item.id === 'ALT-011')?.parentId).toBe('MOT-003');
  });

  it('installs without resolving an unrelated missing component', () => {
    const state = createInitialState();
    expect(takeOrder(state, PEDRO, 'OD-DEMO-062').ok).toBe(true);
    expect(
      addPhoto(state, PEDRO, {
        workOrderId: 'OD-DEMO-062',
        kind: 'BEFORE',
        fileName: 'before-filter.jpg',
      }).ok,
    ).toBe(true);
    expect(
      addPhoto(state, PEDRO, {
        workOrderId: 'OD-DEMO-062',
        kind: 'AFTER',
        fileName: 'after-filter.jpg',
      }).ok,
    ).toBe(true);

    const result = completeInstalacion(state, PEDRO, { workOrderId: 'OD-DEMO-062' });
    expect(result.ok).toBe(true);

    const filter = state.items.find((item) => item.id === 'FIL-001')!;
    expect(filter.physicalRelationship).toBe('INSTALLED');
    expect(filter.parentId).toBe('MOT-002');
    expect(state.items.find((item) => item.id === 'MOT-002')?.complete).toBe(false);
    expect(state.knownMissing.some((entry) => entry.id === 'KM-001')).toBe(true);
    expect(state.knownMissing.some((entry) => entry.id === 'KM-003')).toBe(true);
  });

  it('resolves a category-matched missing component on installation', () => {
    const state = createInitialState();
    const created = createInstalacion(state, ADMIN, {
      pieceId: 'ALT-010',
      destinationParentId: 'MOT-002',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    expect(takeOrder(state, PEDRO, created.value.id).ok).toBe(true);
    expect(
      addPhoto(state, PEDRO, {
        workOrderId: created.value.id,
        kind: 'BEFORE',
        fileName: 'before-alt.jpg',
      }).ok,
    ).toBe(true);
    expect(
      addPhoto(state, PEDRO, {
        workOrderId: created.value.id,
        kind: 'AFTER',
        fileName: 'after-alt.jpg',
      }).ok,
    ).toBe(true);

    const result = completeInstalacion(state, PEDRO, { workOrderId: created.value.id });
    expect(result.ok).toBe(true);
    expect(state.knownMissing.some((entry) => entry.id === 'KM-003')).toBe(false);
    expect(state.knownMissing.some((entry) => entry.id === 'KM-001')).toBe(true);
    expect(state.items.find((item) => item.id === 'MOT-002')?.complete).toBe(false);
    expect(state.items.find((item) => item.id === 'ALT-010')?.parentId).toBe('MOT-002');
  });

  it('projects mechanic views without commercial fields', () => {
    const state = createInitialState();
    const order = state.workOrders.find((entry) => entry.id === 'OD-DEMO-060')!;
    const view = toMechanicWorkOrderView(state, order, PEDRO);
    const serialized = JSON.stringify(view);

    expect(view).not.toHaveProperty('invoiceId');
    expect(serialized).not.toMatch(/invoice/i);
    expect(serialized).not.toMatch(/FAC-/);
    expect(serialized).not.toMatch(/acquisitionCost|profit|payment|customer|balance|refund/i);
    expect(
      buildMechanicWorkOrderList(state, PEDRO)
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(['OD-DEMO-060', 'OD-DEMO-061', 'OD-DEMO-062']);
  });

  it('lists a cancelled assigned order for that mechanic and hides cancelled-before-take', () => {
    const state = createInitialState();

    expect(
      cancelOrder(state, ADMIN, {
        workOrderId: 'OD-DEMO-060',
        reason: 'Abandono verificado',
        physicalVerified: true,
      }).ok,
    ).toBe(true);
    expect(
      cancelOrder(state, ADMIN, {
        workOrderId: 'OD-DEMO-062',
        reason: 'Ya no aplica instalar',
      }).ok,
    ).toBe(true);

    const ids = buildMechanicWorkOrderList(state, PEDRO).map((entry) => entry.id);
    expect(ids).toContain('OD-DEMO-060');
    expect(ids).toContain('OD-DEMO-061');
    expect(ids).not.toContain('OD-DEMO-062');
  });
});
