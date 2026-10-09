import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mockCategoryRepository } from '../../../../src/mocks/repositories/MockCategoryRepository';
import { mockInventoryRepository } from '../../../../src/mocks/repositories/MockInventoryRepository';
import { getMockState, resetMockState } from '../../../../src/mocks/state';
import { signInAs } from '../../../support/session';

describe('MockInventoryRepository', () => {
  beforeEach(() => {
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('denies mechanic catalog access', async () => {
    signInAs('MECHANIC');

    const result = await mockInventoryRepository.listCatalog();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('lets sellers reserve inventory but denies administrative mutations', async () => {
    signInAs('SELLER');

    const added = await mockInventoryRepository.addToDraft({ itemId: 'FIL-001' });
    const noDesarmar = await mockInventoryRepository.setNoDesarmar({
      itemId: 'MOT-002',
      enabled: true,
    });
    const cost = await mockInventoryRepository.correctAcquisitionCost({
      itemId: 'FIL-001',
      acquisitionCostDop: 900,
      reason: 'Corrección',
    });
    const workOrder = await mockInventoryRepository.createManualWorkOrder({
      pieceId: 'ALT-010',
      type: 'INSTALLATION',
      destinationParentId: 'MOT-002',
    });

    expect(added.ok).toBe(true);
    expect(noDesarmar.ok).toBe(false);
    expect(cost.ok).toBe(false);
    expect(workOrder.ok).toBe(false);
  });

  it('lets sellers edit ordinary item details and denies mechanics', async () => {
    signInAs('SELLER');
    const sellerResult = await mockInventoryRepository.updateItemDetails({
      itemId: 'FIL-001',
      name: 'Filtro HD',
      brand: 'Fleetguard',
      partNumber: 'LF9009',
      condition: 'NEW',
      location: 'Estante 3B',
      photos: ['filtro.jpg'],
    });
    expect(sellerResult.ok).toBe(true);
    expect(sellerResult.ok && sellerResult.value.location).toBe('Estante 3B');
    expect(getMockState().items.find((item) => item.id === 'FIL-001')?.photos).toEqual([
      'filtro.jpg',
    ]);

    signInAs('MECHANIC');
    const mechanicResult = await mockInventoryRepository.updateItemDetails({
      itemId: 'FIL-001',
      name: 'No permitido',
      condition: 'USED',
    });
    expect(mechanicResult.ok).toBe(false);
    if (!mechanicResult.ok) {
      expect(mechanicResult.error.code).toBe('FORBIDDEN');
    }
  });

  it('lets sellers register inventory and denies mechanics in the repository', async () => {
    signInAs('SELLER');
    const sellerResult = await mockInventoryRepository.registerItem({
      name: 'Alternador registrado',
      categoryId: 'CAT-ALT',
      condition: 'USED',
    });
    expect(sellerResult.ok).toBe(true);
    expect(sellerResult.ok && sellerResult.value.id).toBe('ALT-012');

    signInAs('MECHANIC');
    const mechanicResult = await mockInventoryRepository.registerQtyProduct({
      id: 'QTY-TEST',
      name: 'No permitido',
      categoryId: 'CAT-FIL',
      initialQuantity: 1,
      unitCostDop: 1,
    });
    const mechanicAssembly = await mockInventoryRepository.registerAssembly({
      parent: {
        name: 'No permitido',
        categoryId: 'CAT-ENG',
        condition: 'USED',
      },
      baseline: [
        { expectedComponentName: 'Alternador', status: 'MISSING' },
        { expectedComponentName: 'Turbo', status: 'MISSING' },
        { expectedComponentName: 'Motor de arranque', status: 'MISSING' },
      ],
    });
    expect(mechanicResult.ok).toBe(false);
    expect(mechanicAssembly.ok).toBe(false);
    expect(getMockState().qtyProducts.some((product) => product.id === 'QTY-TEST')).toBe(false);
    expect(getMockState().items.some((item) => item.id === 'MOT-DENIED')).toBe(false);
  });

  it('persists authorized assembly and quantity registrations through the repository', async () => {
    signInAs('SELLER');
    const assembly = await mockInventoryRepository.registerAssembly({
      parent: {
        name: 'Motor recibido',
        categoryId: 'CAT-ENG',
        condition: 'USED',
      },
      baseline: [
        { expectedComponentName: 'Alternador', status: 'MISSING' },
        { expectedComponentName: 'Turbo', status: 'MISSING' },
        { expectedComponentName: 'Motor de arranque', status: 'NOT_APPLICABLE' },
      ],
    });
    const quantity = await mockInventoryRepository.registerQtyProduct({
      id: 'QTY-FIL-NEW',
      name: 'Filtro por caja',
      categoryId: 'CAT-FIL',
      initialQuantity: 8,
      unitCostDop: 300,
    });

    expect(assembly.ok).toBe(true);
    expect(quantity.ok).toBe(true);
    expect(getMockState().items.some((item) => item.id === 'MOT-004')).toBe(true);
    expect(
      getMockState().qtyProducts.find((product) => product.id === 'QTY-FIL-NEW'),
    ).toMatchObject({ onHand: 8, reserved: 0 });
  });

  it('prevents applying No desarmar to a unique part', async () => {
    signInAs('ADMINISTRATOR');

    const result = await mockInventoryRepository.setNoDesarmar({
      itemId: 'FIL-001',
      enabled: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('does not erase a post-baseline removal through baseline correction', async () => {
    signInAs('ADMINISTRATOR');

    const result = await mockInventoryRepository.correctReceiptBaseline({
      itemId: 'MOT-002',
      reason: 'Intento incorrecto',
      markNotApplicable: ['Alternador'],
    });

    expect(result.ok).toBe(false);
    expect(
      getMockState().knownMissing.some(
        (entry) =>
          entry.expectedComponentName === 'Alternador' && entry.origin === 'REMOVED_AFTER_BASELINE',
      ),
    ).toBe(true);
  });

  it('records additive history for administrator cost corrections', async () => {
    signInAs('ADMINISTRATOR');

    const result = await mockInventoryRepository.correctAcquisitionCost({
      itemId: 'FIL-001',
      acquisitionCostDop: 900,
      costProvenance: 'Factura corregida',
      reason: 'Error de digitación',
    });

    expect(result.ok).toBe(true);
    const event = getMockState().events.find((entry) => entry.type === 'COST_CORRECTED');
    expect(event?.metadata).toMatchObject({
      itemId: 'FIL-001',
      reason: 'Error de digitación',
      after: 900,
      afterCostProvenance: 'Factura corregida',
    });
  });

  it('corrects reception baseline without deleting other missing components', async () => {
    signInAs('ADMINISTRATOR');

    const result = await mockInventoryRepository.correctReceiptBaseline({
      itemId: 'MOT-002',
      reason: 'El turbo no aplica a esta unidad',
      markNotApplicable: ['Turbo'],
    });

    expect(result.ok).toBe(true);
    expect(
      getMockState().knownMissing.some((entry) => entry.expectedComponentName === 'Turbo'),
    ).toBe(false);
    expect(
      getMockState().knownMissing.some((entry) => entry.expectedComponentName === 'Alternador'),
    ).toBe(true);
    expect(getMockState().items.find((item) => item.id === 'MOT-002')?.complete).toBe(false);
  });

  it('creates a pending manual work order without changing physical hierarchy', async () => {
    signInAs('ADMINISTRATOR');

    const result = await mockInventoryRepository.createManualWorkOrder({
      pieceId: 'MOT-001',
      type: 'DISMANTLING',
    });

    expect(result.ok && result.value.status).toBe('PENDING');
    const piece = getMockState().items.find((item) => item.id === 'MOT-001');
    expect(piece?.parentId).toBe('CAM-001');
    expect(piece?.physicalRelationship).toBe('INSTALLED');
  });

  it('returns defensive copies for catalog and detail reads', async () => {
    signInAs('SELLER');

    const first = await mockInventoryRepository.getDetail('FIL-001');
    expect(first.ok).toBe(true);
    if (first.ok && first.value.kind === 'ITEM') {
      first.value.name = 'Mutación externa';
    }
    const second = await mockInventoryRepository.getDetail('FIL-001');

    expect(second.ok && second.value.name).toBe('Filtro de aceite HD');
  });

  it('lets an administrator resolve a catalog review and denies the seller', async () => {
    signInAs('ADMINISTRATOR');
    await mockCategoryRepository.save({
      id: 'CAT-ENG',
      name: 'Motor',
      isAssembly: true,
      expectedComponents: ['Alternador', 'Turbo', 'Motor de arranque', 'Bomba de aceite'],
    });

    const confirmed = await mockInventoryRepository.resolveCatalogReview({
      itemId: 'MOT-001',
      expectedComponentName: 'Bomba de aceite',
      decision: 'NOT_APPLICABLE',
    });
    expect(confirmed.ok).toBe(true);
    expect(getMockState().pendingCatalogReviews.some((entry) => entry.parentId === 'MOT-001')).toBe(
      false,
    );

    signInAs('SELLER');
    const denied = await mockInventoryRepository.resolveCatalogReview({
      itemId: 'MOT-003',
      expectedComponentName: 'Bomba de aceite',
      decision: 'MISSING',
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe('FORBIDDEN');
    }
    expect(getMockState().pendingCatalogReviews.some((entry) => entry.parentId === 'MOT-003')).toBe(
      true,
    );
  });
});
