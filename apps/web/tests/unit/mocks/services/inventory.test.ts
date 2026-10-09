import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../../../src/mocks/data/seed';
import { backfillPendingExpectedComponents } from '../../../../src/mocks/services/catalogs-reviews';
import type { RegisterQtyProductInput } from '../../../../src/api/contracts/inventory';
import {
  buildInventoryCatalog,
  buildItemDetail,
  buildQtyProductDetail,
} from '../../../../src/mocks/services/inventory-catalog';
import {
  addInventoryToDraft,
  adjustQtyStock,
  correctAcquisitionCost,
  createManualWorkOrder,
  receiveQtyStock,
  registerAssembly,
  registerItem,
  registerQtyProduct,
  resolveCatalogReview,
  updateItemDetails,
  updateQtyProductDetails,
} from '../../../../src/mocks/services/inventory-commands';
import {
  availableToReserve,
  effectiveLocation,
  isComplete,
  protectedAncestor,
} from '../../../../src/mocks/services/inventory-helpers';

const SELLER = {
  id: 'U-LAURA',
  name: 'Laura Pérez',
  username: 'laura',
  password: 'demo1234',
  role: 'SELLER' as const,
  active: true,
};

const ADMIN = {
  id: 'U-ADMIN',
  name: 'Administrador Demo',
  username: 'admin',
  password: 'demo1234',
  role: 'ADMINISTRATOR' as const,
  active: true,
};

describe('inventory helpers', () => {
  const state = createInitialState();

  it('inherits effective location from the truck root for installed descendants', () => {
    const alt = state.items.find((item) => item.id === 'ALT-004');
    expect(alt).toBeDefined();
    expect(effectiveLocation(state.items, alt!)).toBe('Patio A');
    expect(alt!.location).toBeUndefined();
  });

  it('uses the independent item location', () => {
    const filter = state.items.find((item) => item.id === 'FIL-001');
    expect(effectiveLocation(state.items, filter!)).toBe('Estante 3');
  });

  it('does not treat unique parts as complete or incomplete', () => {
    const alt = state.items.find((item) => item.id === 'ALT-004');
    expect(isComplete(alt!, state.knownMissing, state.categories)).toBeUndefined();
  });

  it('keeps MOT-001 complete while sold turbos remain installed pending desarme', () => {
    const engine = state.items.find((item) => item.id === 'MOT-001');
    const turbo = state.items.find((item) => item.id === 'TUR-009');
    expect(turbo?.commercialState).toBe('SOLD');
    expect(turbo?.physicalRelationship).toBe('INSTALLED');
    expect(turbo?.parentId).toBe('MOT-001');
    expect(isComplete(engine!, state.knownMissing, state.categories)).toBe(true);

    const detail = buildItemDetail(state, 'MOT-001');
    expect(detail?.soldInstalledChildren.map((child) => child.id).sort()).toEqual([
      'ARR-002',
      'TUR-009',
    ]);
  });

  it('records a completed desarme as independent without erasing former parent', () => {
    const alt = state.items.find((item) => item.id === 'ALT-010');
    expect(alt?.physicalRelationship).toBe('INDEPENDENT');
    expect(alt?.parentId).toBeUndefined();
    const detail = buildItemDetail(state, 'ALT-010');
    expect(detail?.formerInstallation).toMatchObject({
      parentId: 'MOT-002',
      workOrderId: 'OD-DEMO-063',
    });
    expect(detail?.events[0]).toMatchObject({
      type: 'DISMANTLING_COMPLETED',
      actorName: 'Carlos Méndez',
    });
  });

  it('marks MOT-002 incomplete because of the missing turbo', () => {
    const engine = state.items.find((item) => item.id === 'MOT-002');
    expect(isComplete(engine!, state.knownMissing, state.categories)).toBe(false);
    expect(state.knownMissing.some((entry) => entry.parentId === 'MOT-002')).toBe(true);
  });

  it('HIER-008: applies No desarmar to real descendants of MOT-003', () => {
    const engine = state.items.find((item) => item.id === 'MOT-003')!;
    const descendant = state.items.find((item) => item.id === 'ALT-011')!;

    expect(protectedAncestor(state.items, descendant)?.id).toBe('MOT-003');
    expect(protectedAncestor(state.items, engine)?.id).toBe('MOT-003');
  });

  it('HIER-007: a missing engine component does not change truck completeness', () => {
    const truck = state.items.find((item) => item.id === 'CAM-001')!;
    const engine = state.items.find((item) => item.id === 'MOT-001')!;
    const truckBefore = isComplete(truck, state.knownMissing, state.categories);
    const patchedMissing = [
      ...state.knownMissing,
      {
        id: 'KM-TEST',
        parentId: 'MOT-001',
        expectedComponentName: 'Sensor',
        origin: 'MISSING_AT_RECEIPT' as const,
      },
    ];

    expect(isComplete(engine, patchedMissing, state.categories)).toBe(false);
    expect(isComplete(truck, patchedMissing, state.categories)).toBe(truckBefore);
  });

  it('QTY-002: computes quantity available as onHand minus reserved', () => {
    const oil = state.qtyProducts.find((product) => product.id === 'QTY-OIL-15W40')!;
    expect(availableToReserve(oil.onHand, oil.reserved)).toBe(46);
  });
});

describe('buildInventoryCatalog', () => {
  const state = createInitialState();

  it('hides sold items until the historical toggle is on', () => {
    const available = buildInventoryCatalog(state, { includeSold: false });
    expect(available.some((row) => row.id === 'TUR-009')).toBe(false);

    const withSold = buildInventoryCatalog(state, { includeSold: true });
    expect(withSold.some((row) => row.id === 'TUR-009')).toBe(true);
  });

  it('searches across id, name, serial and part number', () => {
    expect(buildInventoryCatalog(state, { query: 'DD15' }).map((row) => row.id)).toContain(
      'MOT-001',
    );
    expect(buildInventoryCatalog(state, { query: 'LF9009' }).map((row) => row.id)).toEqual([
      'FIL-001',
    ]);
    expect(buildInventoryCatalog(state, { query: '15W-40' }).map((row) => row.id)).toEqual([
      'QTY-OIL-15W40',
    ]);
    expect(buildInventoryCatalog(state, { query: '14.8L' }).map((row) => row.id)).toEqual([
      'MOT-001',
    ]);
  });

  it('omits completeness on unique-part catalog rows', () => {
    const alt = buildInventoryCatalog(state).find((row) => row.id === 'ALT-004');
    expect(alt?.isAssembly).toBe(false);
    expect(alt?.complete).toBeUndefined();
  });

  it('filters by category and includes quantity products', () => {
    const rows = buildInventoryCatalog(state, { categoryId: 'CAT-OIL' });
    expect(rows.map((row) => row.id)).toEqual(['QTY-OIL-15W40']);
  });

  it('hides sold items when Disponible is set even if includeSold is true', () => {
    const rows = buildInventoryCatalog(state, {
      includeSold: true,
      quick: ['available'],
    });
    expect(rows.some((row) => row.id === 'TUR-009')).toBe(false);
    expect(rows.some((row) => row.commercialState === 'SOLD')).toBe(false);
    expect(rows.some((row) => row.id === 'FIL-001')).toBe(true);
  });

  it('combines available and independent with AND and excludes qty and installed rows', () => {
    const ids = buildInventoryCatalog(state, { quick: ['available', 'independent'] }).map(
      (row) => row.id,
    );
    expect(ids).toContain('MOT-002');
    expect(ids).toContain('FIL-001');
    expect(ids).not.toContain('ALT-004');
    expect(ids).not.toContain('QTY-OIL-15W40');
  });

  it('returns only quantity products for the quantity quick filter', () => {
    const rows = buildInventoryCatalog(state, { quick: ['quantity'] });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.kind === 'QTY')).toBe(true);
  });

  it('does not match quantity products for installed, independent, assemblies or incomplete', () => {
    expect(buildInventoryCatalog(state, { quick: ['quantity', 'installed'] })).toEqual([]);
    expect(buildInventoryCatalog(state, { quick: ['quantity', 'independent'] })).toEqual([]);
    expect(buildInventoryCatalog(state, { quick: ['quantity', 'assemblies'] })).toEqual([]);
    expect(buildInventoryCatalog(state, { quick: ['quantity', 'incomplete'] })).toEqual([]);
  });

  it('excludes qty rows when a condition is set and matches item condition', () => {
    const rows = buildInventoryCatalog(state, { condition: 'NEW' });
    expect(rows.every((row) => row.kind === 'ITEM')).toBe(true);
    expect(rows.map((row) => row.id)).toEqual(['FIL-001']);
  });

  it('matches location against effectiveLocation including inherited warehouse text', () => {
    const ids = buildInventoryCatalog(state, { location: 'patio a' }).map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining(['CAM-001', 'MOT-001', 'ALT-004']));
    expect(ids).not.toContain('FIL-001');
    expect(ids).not.toContain('QTY-OIL-15W40');
  });

  it('filters reserved items including quantity products with reserved stock', () => {
    const ids = buildInventoryCatalog(state, { quick: ['reserved'] }).map((row) => row.id);
    expect(ids).toContain('ALT-004');
    expect(ids).toContain('QTY-OIL-15W40');
  });

  it('filters assemblies and incomplete assemblies', () => {
    const assemblies = buildInventoryCatalog(state, { quick: ['assemblies'] }).map((row) => row.id);
    expect(assemblies).toEqual(
      expect.arrayContaining(['CAM-001', 'MOT-001', 'MOT-002', 'MOT-003']),
    );
    expect(assemblies.every((id) => !id.startsWith('QTY-'))).toBe(true);

    const incomplete = buildInventoryCatalog(state, { quick: ['incomplete'] }).map((row) => row.id);
    expect(incomplete).toEqual(expect.arrayContaining(['CAM-001', 'MOT-002']));
    expect(incomplete).not.toContain('MOT-001');
  });

  it('filters by kind and commercial state', () => {
    const qty = buildInventoryCatalog(state, { kind: 'QTY' });
    expect(qty.every((row) => row.kind === 'QTY')).toBe(true);

    const items = buildInventoryCatalog(state, { kind: 'ITEM' });
    expect(items.every((row) => row.kind === 'ITEM')).toBe(true);

    const sold = buildInventoryCatalog(state, { includeSold: true, commercialState: 'SOLD' });
    expect(sold.map((row) => row.id).sort()).toEqual(['ARR-002', 'TUR-009']);
  });

  it('restricts the list to pending-catalog parent items', () => {
    const withReviews = {
      ...state,
      pendingCatalogReviews: [
        {
          id: 'PCR-TEST',
          parentId: 'MOT-001',
          expectedComponentName: 'Bomba de aceite',
          kind: 'PENDING_NA' as const,
        },
      ],
    };
    expect(
      buildInventoryCatalog(withReviews, { pendingCatalog: true }).map((row) => row.id),
    ).toEqual(['MOT-001']);
  });
});

describe('detail projections', () => {
  const state = createInitialState();

  it('exposes a physically valid CAM-001 tree with one engine and a missing transmission', () => {
    const detail = buildItemDetail(state, 'CAM-001');
    expect(detail?.tree.id).toBe('CAM-001');
    expect(detail?.complete).toBe(false);
    expect(detail?.tree.children.map((child) => child.id)).toEqual(['MOT-001']);
    expect(detail?.tree.missingSlots.map((slot) => slot.name)).toEqual(['Transmisión']);
    expect(detail?.tree.children.some((child) => child.id === 'MOT-002')).toBe(false);
    expect(detail?.tree.children.some((child) => child.id === 'MOT-003')).toBe(false);
  });

  it('keeps MOT-002 and MOT-003 as independent yard engines', () => {
    const isx = state.items.find((item) => item.id === 'MOT-002');
    const dd13 = state.items.find((item) => item.id === 'MOT-003');
    expect(isx?.physicalRelationship).toBe('INDEPENDENT');
    expect(isx?.parentId).toBeUndefined();
    expect(dd13?.physicalRelationship).toBe('INDEPENDENT');
    expect(dd13?.parentId).toBeUndefined();
    expect(buildItemDetail(state, 'MOT-002')?.tree.id).toBe('MOT-002');
    expect(buildItemDetail(state, 'MOT-003')?.tree.id).toBe('MOT-003');
    expect(buildItemDetail(state, 'MOT-003')?.tree.children.map((child) => child.id)).toEqual([
      'ALT-011',
    ]);
  });

  it('shows an installed engine with its truck parent and only its own descendants', () => {
    const detail = buildItemDetail(state, 'MOT-001');
    expect(detail?.tree.id).toBe('CAM-001');
    expect(detail?.tree.missingSlots).toEqual([]);
    expect(detail?.tree.children.map((child) => child.id)).toEqual(['MOT-001']);
    const engine = detail?.tree.children[0];
    expect(engine?.children.map((child) => child.id).sort()).toEqual([
      'ALT-004',
      'ARR-002',
      'TUR-009',
    ]);
  });

  it('shows an installed part with parent engine and no sibling parts', () => {
    const detail = buildItemDetail(state, 'ALT-004');
    expect(detail?.tree.id).toBe('CAM-001');
    const engine = detail?.tree.children[0];
    expect(engine?.id).toBe('MOT-001');
    expect(engine?.children.map((child) => child.id)).toEqual(['ALT-004']);
    expect(engine?.children.some((child) => child.id === 'ARR-002')).toBe(false);
  });

  it('shows MOT-002 missing turbo and incomplete', () => {
    const detail = buildItemDetail(state, 'MOT-002');
    expect(detail?.complete).toBe(false);
    expect(detail?.missingComponents.map((entry) => entry.expectedComponentName)).toEqual([
      'Turbo',
      'Alternador',
    ]);
  });

  it('HIER-008: blocks separate sale of a No desarmar descendant', () => {
    const detail = buildItemDetail(state, 'ALT-011');
    expect(detail?.draftEligibility.allowed).toBe(false);
    expect(detail?.protectedRootId).toBe('MOT-003');
    expect(detail?.effectiveLocation).toBe('Patio C');
  });

  it('allows selling the protected root as a unit', () => {
    const detail = buildItemDetail(state, 'MOT-003');
    expect(detail?.draftEligibility.allowed).toBe(true);
    expect(detail?.noDesarmar).toBe(true);
  });

  it('RES-001: overlapping ancestor is not draft-eligible while a descendant is reserved', () => {
    const detail = buildItemDetail(state, 'MOT-001');
    expect(detail?.draftEligibility.allowed).toBe(false);
  });

  it('projects quantity availability', () => {
    const detail = buildQtyProductDetail(state, 'QTY-OIL-15W40');
    expect(detail?.availableToReserve).toBe(46);
    expect(detail?.onHand).toBe(48);
    expect(detail?.reserved).toBe(2);
  });
});

describe('inventory commands', () => {
  it('registers an individual item while keeping unknown cost absent', () => {
    const state = createInitialState();
    const result = registerItem(state, SELLER, {
      name: 'Alternador de prueba',
      categoryId: 'CAT-ALT',
      condition: 'USED',
      attributes: { voltage: '24V' },
      photos: ['frente.jpg'],
    });

    expect(result.ok).toBe(true);
    expect(state.items.find((item) => item.id === 'ALT-012')).toMatchObject({
      commercialState: 'AVAILABLE',
      physicalRelationship: 'INDEPENDENT',
      attributes: { voltage: '24V' },
    });
    expect(state.items.find((item) => item.id === 'ALT-012')).not.toHaveProperty(
      'acquisitionCostDop',
    );
    expect(state.itemCodeSeq['CAT-ALT']).toBe(13);
  });

  it('rejects arbitrary attributes and missing category minimums', () => {
    const state = createInitialState();
    const unknown = registerItem(state, SELLER, {
      name: 'Alternador libre',
      categoryId: 'CAT-ALT',
      condition: 'USED',
      attributes: { voltaje: '24V' },
    });
    const incompleteTire = registerItem(state, SELLER, {
      name: 'Goma incompleta',
      categoryId: 'CAT-TIR',
      condition: 'USED',
      attributes: { tireType: 'Radial' },
    });
    const tire = registerItem(state, SELLER, {
      name: 'Goma 11R22.5',
      categoryId: 'CAT-TIR',
      condition: 'USED',
      attributes: { tireType: 'Radial', size: '11R22.5', diameter: '22.5' },
    });

    expect(unknown.ok).toBe(false);
    expect(incompleteTire.ok).toBe(false);
    expect(tire.ok).toBe(true);
    if (tire.ok) {
      expect(tire.value.attributes).toEqual({
        tireType: 'Radial',
        size: '11R22.5',
        diameter: '22.5',
      });
    }
  });

  it('keeps historical attributes when the category schema no longer includes them', () => {
    const state = createInitialState();
    const engine = state.categories.find((category) => category.id === 'CAT-ENG')!;
    engine.attributes = [];
    const result = updateItemDetails(state, SELLER, {
      itemId: 'MOT-001',
      name: 'Detroit DD15 Completo',
      condition: 'USED',
      attributes: {},
    });

    expect(result.ok).toBe(true);
    expect(state.items.find((item) => item.id === 'MOT-001')?.attributes).toEqual({
      displacement: '14.8L',
    });
  });

  it('registers quantity inventory with initial stock and zero reservation', () => {
    const state = createInitialState();
    const altSeq = state.itemCodeSeq['CAT-ALT'];
    const result = registerQtyProduct(state, SELLER, {
      id: 'QTY-FIL-NEW',
      name: 'Filtro nuevo por caja',
      categoryId: 'CAT-FIL',
      initialQuantity: 12,
      unitCostDop: 450,
      location: 'Estante 8',
    });

    expect(result.ok).toBe(true);
    expect(state.qtyProducts.find((product) => product.id === 'QTY-FIL-NEW')).toMatchObject({
      onHand: 12,
      reserved: 0,
      unitCostDop: 450,
    });
    expect(state.itemCodeSeq['CAT-ALT']).toBe(altSeq);
  });

  it('registers an assembly parent, present children and receipt missing slots atomically', () => {
    const state = createInitialState();
    const result = registerAssembly(state, SELLER, {
      parent: {
        name: 'Motor recibido',
        categoryId: 'CAT-ENG',
        condition: 'USED',
        location: 'Patio D',
      },
      baseline: [
        {
          expectedComponentName: 'Alternador',
          status: 'PRESENT',
          item: {
            name: 'Alternador instalado',
            categoryId: 'CAT-ALT',
            condition: 'USED',
          },
        },
        { expectedComponentName: 'Turbo', status: 'MISSING' },
        { expectedComponentName: 'Motor de arranque', status: 'NOT_APPLICABLE' },
      ],
    });

    expect(result.ok).toBe(true);
    expect(state.items.find((item) => item.id === 'MOT-004')?.complete).toBe(false);
    expect(state.items.find((item) => item.id === 'ALT-012')).toMatchObject({
      parentId: 'MOT-004',
      physicalRelationship: 'INSTALLED',
    });
    expect(state.knownMissing).toContainEqual(
      expect.objectContaining({
        parentId: 'MOT-004',
        expectedComponentName: 'Turbo',
        origin: 'MISSING_AT_RECEIPT',
      }),
    );
    expect(
      state.knownMissing.some(
        (entry) =>
          entry.parentId === 'MOT-004' && entry.expectedComponentName === 'Motor de arranque',
      ),
    ).toBe(false);
  });

  it('HIER-001/HIER-011: registers a truck, its present engine and the engine baseline recursively', () => {
    const state = createInitialState();
    const result = registerAssembly(state, SELLER, {
      parent: {
        name: 'Camión recibido',
        categoryId: 'CAT-TRK',
        condition: 'USED',
        location: 'Patio D',
      },
      baseline: [
        {
          expectedComponentName: 'Motor',
          status: 'PRESENT',
          item: {
            name: 'Motor recibido dentro del camión',
            categoryId: 'CAT-ENG',
            condition: 'USED',
          },
          baseline: [
            {
              expectedComponentName: 'Alternador',
              status: 'PRESENT',
              item: {
                name: 'Alternador recibido dentro del motor',
                categoryId: 'CAT-ALT',
                condition: 'USED',
              },
            },
            { expectedComponentName: 'Turbo', status: 'MISSING' },
            { expectedComponentName: 'Motor de arranque', status: 'NOT_APPLICABLE' },
          ],
        },
        { expectedComponentName: 'Transmisión', status: 'NOT_APPLICABLE' },
      ],
    });

    expect(result.ok).toBe(true);
    expect(state.items.find((item) => item.id === 'CAM-002')?.complete).toBe(true);
    expect(state.items.find((item) => item.id === 'MOT-004')).toMatchObject({
      parentId: 'CAM-002',
      complete: false,
    });
    expect(state.items.find((item) => item.id === 'ALT-012')).toMatchObject({
      parentId: 'MOT-004',
      physicalRelationship: 'INSTALLED',
    });
    expect(state.knownMissing).toContainEqual(
      expect.objectContaining({
        parentId: 'MOT-004',
        expectedComponentName: 'Turbo',
        origin: 'MISSING_AT_RECEIPT',
      }),
    );
    const detail = buildItemDetail(state, 'CAM-002');
    expect(detail?.tree.children[0]?.children[0]?.id).toBe('ALT-012');
    expect(detail?.tree.children[0]?.missingSlots.map((slot) => slot.name)).toEqual(['Turbo']);
    expect(state.events.at(-1)?.metadata?.receiptTree).toMatchObject({
      itemId: 'CAM-002',
      complete: true,
      baseline: [
        {
          expectedComponentName: 'Motor',
          status: 'PRESENT',
          child: {
            itemId: 'MOT-004',
            complete: false,
            baseline: [
              { expectedComponentName: 'Alternador', status: 'PRESENT' },
              { expectedComponentName: 'Turbo', status: 'MISSING' },
              { expectedComponentName: 'Motor de arranque', status: 'NOT_APPLICABLE' },
            ],
          },
        },
        { expectedComponentName: 'Transmisión', status: 'NOT_APPLICABLE' },
      ],
    });
  });

  it('does not consume item codes when a nested baseline fails', () => {
    const state = createInitialState();
    const itemCount = state.items.length;
    const missingCount = state.knownMissing.length;
    const eventCount = state.events.length;
    const seqBefore = { ...state.itemCodeSeq };
    const result = registerAssembly(state, SELLER, {
      parent: {
        name: 'Camión recibido',
        categoryId: 'CAT-TRK',
        condition: 'USED',
      },
      baseline: [
        {
          expectedComponentName: 'Motor',
          status: 'PRESENT',
          item: {
            name: 'Motor recibido',
            categoryId: 'CAT-ENG',
            condition: 'USED',
          },
          baseline: [
            {
              expectedComponentName: 'Alternador',
              status: 'PRESENT',
            },
            { expectedComponentName: 'Turbo', status: 'MISSING' },
            { expectedComponentName: 'Motor de arranque', status: 'NOT_APPLICABLE' },
          ],
        },
        { expectedComponentName: 'Transmisión', status: 'NOT_APPLICABLE' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(state.items).toHaveLength(itemCount);
    expect(state.knownMissing).toHaveLength(missingCount);
    expect(state.events).toHaveLength(eventCount);
    expect(state.itemCodeSeq).toEqual(seqBefore);
  });

  it('rejects a child whose category does not match the expected slot without partial writes', () => {
    const state = createInitialState();
    const itemCount = state.items.length;
    const result = registerAssembly(state, SELLER, {
      parent: {
        name: 'Motor recibido',
        categoryId: 'CAT-ENG',
        condition: 'USED',
      },
      baseline: [
        {
          expectedComponentName: 'Alternador',
          status: 'PRESENT',
          item: {
            name: 'Categoría incorrecta',
            categoryId: 'CAT-FIL',
            condition: 'USED',
          },
        },
        { expectedComponentName: 'Turbo', status: 'MISSING' },
        { expectedComponentName: 'Motor de arranque', status: 'NOT_APPLICABLE' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(state.items).toHaveLength(itemCount);
    expect(state.items.some((item) => item.id === 'MOT-004')).toBe(false);
  });

  it('rejects quantity assemblies and missing or non-finite unit costs', () => {
    const state = createInitialState();
    const assembly = registerQtyProduct(state, SELLER, {
      id: 'QTY-ENGINE',
      name: 'Motor por cantidad',
      categoryId: 'CAT-ENG',
      initialQuantity: 1,
      unitCostDop: 1,
    });
    const missingCost = registerQtyProduct(state, SELLER, {
      id: 'QTY-NO-COST',
      name: 'Sin costo',
      categoryId: 'CAT-FIL',
      initialQuantity: 1,
    } as RegisterQtyProductInput);
    const nanCost = registerQtyProduct(state, SELLER, {
      id: 'QTY-NAN',
      name: 'Costo inválido',
      categoryId: 'CAT-FIL',
      initialQuantity: 1,
      unitCostDop: Number.NaN,
    });

    expect(assembly.ok).toBe(false);
    expect(missingCost.ok).toBe(false);
    expect(nanCost.ok).toBe(false);
    expect(
      state.qtyProducts.some((product) =>
        ['QTY-ENGINE', 'QTY-NO-COST', 'QTY-NAN'].includes(product.id),
      ),
    ).toBe(false);
  });

  it('rejects incomplete assembly checklists without partial writes', () => {
    const state = createInitialState();
    const itemCount = state.items.length;
    const missingCount = state.knownMissing.length;
    const seqBefore = { ...state.itemCodeSeq };
    const incomplete = registerAssembly(state, SELLER, {
      parent: {
        name: 'Motor incompleto',
        categoryId: 'CAT-ENG',
        condition: 'USED',
      },
      baseline: [{ expectedComponentName: 'Turbo', status: 'MISSING' }],
    });

    expect(incomplete.ok).toBe(false);
    expect(state.items).toHaveLength(itemCount);
    expect(state.knownMissing).toHaveLength(missingCount);
    expect(state.itemCodeSeq).toEqual(seqBefore);
  });

  it('leaves state unchanged when a protected descendant is rejected without an open draft', () => {
    const state = createInitialState();
    state.invoices = state.invoices.filter((invoice) => invoice.status !== 'DRAFT');
    const invoiceCount = state.invoices.length;
    const eventCount = state.events.length;

    const result = addInventoryToDraft(state, SELLER, { itemId: 'ALT-011' });

    expect(result.ok).toBe(false);
    expect(state.invoices).toHaveLength(invoiceCount);
    expect(state.invoices.some((invoice) => invoice.status === 'DRAFT')).toBe(false);
    expect(state.events).toHaveLength(eventCount);
  });

  it('does not create a draft when a quantity reservation is rejected', () => {
    const state = createInitialState();
    state.invoices = state.invoices.filter((invoice) => invoice.status !== 'DRAFT');
    const product = state.qtyProducts.find((entry) => entry.id === 'QTY-OIL-15W40')!;
    product.reserved = 0;
    const invoiceCount = state.invoices.length;

    const result = addInventoryToDraft(state, SELLER, {
      qtyProductId: 'QTY-OIL-15W40',
      quantity: 49,
    });

    expect(result.ok).toBe(false);
    expect(state.invoices).toHaveLength(invoiceCount);
    expect(state.invoices.some((invoice) => invoice.status === 'DRAFT')).toBe(false);
  });

  it('HIER-008: rejects adding a No desarmar descendant to a draft', () => {
    const state = createInitialState();
    const result = addInventoryToDraft(state, SELLER, { itemId: 'ALT-011' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('MOT-003');
    }
  });

  it('RES-001: reserves without marking the item Sold', () => {
    const state = createInitialState();
    const result = addInventoryToDraft(state, SELLER, { itemId: 'FIL-001' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.draftId).toBe('INV-DRAFT-01');
      expect(result.value.alreadyInDraft).toBe(false);
    }
    const filter = state.items.find((item) => item.id === 'FIL-001');
    expect(filter?.reservedByDraftId).toBe('INV-DRAFT-01');
    expect(filter?.commercialState).toBe('AVAILABLE');
  });

  it('LINE-001 / COST-003: copies known item acquisitionCostDop onto the new draft ITEM line', () => {
    const state = createInitialState();
    const item = state.items.find((entry) => entry.id === 'FIL-001')!;
    expect(item.acquisitionCostDop).toBe(850);

    const result = addInventoryToDraft(state, SELLER, { itemId: 'FIL-001' });
    expect(result.ok).toBe(true);

    const line = state.invoices
      .find((invoice) => invoice.status === 'DRAFT')
      ?.lines.find((entry) => entry.itemId === 'FIL-001');
    expect(line).toMatchObject({
      type: 'ITEM',
      acquisitionCostDop: 850,
    });
  });

  it('RES-001: rejects overlapping parent reservation while a descendant is held', () => {
    const state = createInitialState();
    const result = addInventoryToDraft(state, SELLER, { itemId: 'MOT-001' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('RES-001: rejects adding a unique item already reserved on another draft', () => {
    const state = createInitialState();
    const filter = state.items.find((item) => item.id === 'FIL-001');
    expect(filter).toBeDefined();
    filter!.reservedByDraftId = 'INV-DRAFT-02';
    state.invoices.push({
      id: 'INV-DRAFT-02',
      status: 'DRAFT',
      customerId: 'C0',
      currency: 'DOP',
      fiscal: false,
      lines: [],
      payments: [],
      paymentState: 'UNPAID',
      createdAt: '2026-08-26T12:00:00.000Z',
    });

    const result = addInventoryToDraft(state, SELLER, { itemId: 'FIL-001' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
      expect(result.error.message).toContain('INV-DRAFT-02');
    }
    expect(
      state.invoices
        .find((invoice) => invoice.id === 'INV-DRAFT-01')
        ?.lines.some((line) => line.itemId === 'FIL-001'),
    ).toBe(false);
    expect(filter!.reservedByDraftId).toBe('INV-DRAFT-02');
  });

  it('HIER-008: rejects dismantling a No desarmar descendant', () => {
    const state = createInitialState();
    const result = createManualWorkOrder(state, SELLER, {
      pieceId: 'ALT-011',
      type: 'DISMANTLING',
    });
    expect(result.ok).toBe(false);
  });

  it('HIER-002: rejects installing a parent into its own descendant', () => {
    const state = createInitialState();
    const result = createManualWorkOrder(state, SELLER, {
      pieceId: 'CAM-001',
      type: 'INSTALLATION',
      destinationParentId: 'MOT-001',
    });
    expect(result.ok).toBe(false);
  });

  it('HIER-001: rejects installation into a unique part', () => {
    const state = createInitialState();
    const result = createManualWorkOrder(state, SELLER, {
      pieceId: 'ALT-010',
      type: 'INSTALLATION',
      destinationParentId: 'FIL-001',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a quantity greater than available-to-reserve', () => {
    const state = createInitialState();
    const result = addInventoryToDraft(state, SELLER, {
      qtyProductId: 'QTY-OIL-15W40',
      quantity: 47,
    });
    expect(result.ok).toBe(false);
  });

  it('reserves quantity as onHand minus previous reserved', () => {
    const state = createInitialState();
    const result = addInventoryToDraft(state, SELLER, {
      qtyProductId: 'QTY-FIL-AIR',
      quantity: 1,
    });
    expect(result.ok).toBe(true);
    const product = state.qtyProducts.find((entry) => entry.id === 'QTY-FIL-AIR');
    expect(product?.reserved).toBe(1);
    expect(availableToReserve(product!.onHand, product!.reserved)).toBe(23);
  });

  it('LINE-001 / COST-003: copies qty product unitCostDop onto the new draft QTY line', () => {
    const state = createInitialState();
    const product = state.qtyProducts.find((entry) => entry.id === 'QTY-FIL-AIR')!;
    const unitCostDop = product.unitCostDop;

    const result = addInventoryToDraft(state, SELLER, {
      qtyProductId: 'QTY-FIL-AIR',
      quantity: 1,
    });
    expect(result.ok).toBe(true);

    const line = state.invoices
      .find((invoice) => invoice.status === 'DRAFT')
      ?.lines.find((entry) => entry.qtyProductId === 'QTY-FIL-AIR');
    expect(line).toMatchObject({
      type: 'QTY',
      acquisitionCostDop: unitCostDop,
    });
  });

  it('clears cost provenance explicitly and audits its before/after state', () => {
    const state = createInitialState();
    const item = state.items.find((entry) => entry.id === 'FIL-001')!;
    item.costProvenance = 'Factura de compra original';
    const beforeCost = item.acquisitionCostDop;

    const result = correctAcquisitionCost(state, SELLER, {
      itemId: item.id,
      acquisitionCostDop: 900,
      costProvenance: null,
      reason: 'Procedencia registrada por error',
    });

    expect(result.ok).toBe(true);
    expect(item.costProvenance).toBeUndefined();
    const event = state.events.find((entry) => entry.type === 'COST_CORRECTED');
    expect(event?.metadata).toMatchObject({
      itemId: item.id,
      before: beforeCost,
      after: 900,
      beforeCostProvenance: 'Factura de compra original',
    });
    expect(event?.metadata).toHaveProperty('afterCostProvenance', null);
  });

  it('rejects non-finite cost corrections without changing the item', () => {
    const state = createInitialState();
    const item = state.items.find((entry) => entry.id === 'FIL-001')!;
    const beforeCost = item.acquisitionCostDop;
    const eventCount = state.events.length;

    const result = correctAcquisitionCost(state, SELLER, {
      itemId: item.id,
      acquisitionCostDop: Number.NaN,
      reason: 'Valor inválido',
    });

    expect(result.ok).toBe(false);
    expect(item.acquisitionCostDop).toBe(beforeCost);
    expect(state.events).toHaveLength(eventCount);
  });

  it('keeps an assembly complete when the administrator confirms catalog NA', () => {
    const state = createInitialState();
    const admin = state.users[0]!;
    const engine = state.categories.find((category) => category.id === 'CAT-ENG')!;
    backfillPendingExpectedComponents(state, admin, engine, ['Bomba de aceite']);

    const result = resolveCatalogReview(state, admin, {
      itemId: 'MOT-001',
      expectedComponentName: 'Bomba de aceite',
      decision: 'NOT_APPLICABLE',
    });

    expect(result.ok).toBe(true);
    expect(state.pendingCatalogReviews.some((entry) => entry.parentId === 'MOT-001')).toBe(false);
    expect(
      isComplete(
        state.items.find((item) => item.id === 'MOT-001')!,
        state.knownMissing,
        state.categories,
      ),
    ).toBe(true);
    expect(
      state.knownMissing.some(
        (entry) =>
          entry.parentId === 'MOT-001' && entry.expectedComponentName === 'Bomba de aceite',
      ),
    ).toBe(false);
  });

  it('marks the assembly incomplete when the administrator records a catalog gap as missing', () => {
    const state = createInitialState();
    const admin = state.users[0]!;
    const engine = state.categories.find((category) => category.id === 'CAT-ENG')!;
    backfillPendingExpectedComponents(state, admin, engine, ['Bomba de aceite']);

    const result = resolveCatalogReview(state, admin, {
      itemId: 'MOT-001',
      expectedComponentName: 'Bomba de aceite',
      decision: 'MISSING',
    });

    expect(result.ok).toBe(true);
    const item = state.items.find((entry) => entry.id === 'MOT-001')!;
    expect(item.complete).toBe(false);
    expect(
      state.knownMissing.some(
        (entry) =>
          entry.parentId === 'MOT-001' &&
          entry.expectedComponentName === 'Bomba de aceite' &&
          entry.origin === 'MISSING_AT_RECEIPT',
      ),
    ).toBe(true);
  });

  it('registers a present catalog slot as an installed child on the assembly tree', () => {
    const state = createInitialState();
    const admin = state.users[0]!;
    const engine = state.categories.find((category) => category.id === 'CAT-ENG')!;
    backfillPendingExpectedComponents(state, admin, engine, ['Filtros']);

    const result = resolveCatalogReview(state, admin, {
      itemId: 'MOT-001',
      expectedComponentName: 'Filtros',
      decision: 'PRESENT',
      item: {
        name: 'Filtro del DD15',
        categoryId: 'CAT-FIL',
        condition: 'USED',
      },
    });

    expect(result.ok).toBe(true);
    const child = state.items.find((entry) => entry.id === 'FIL-002');
    expect(child).toMatchObject({
      parentId: 'MOT-001',
      physicalRelationship: 'INSTALLED',
      categoryId: 'CAT-FIL',
    });
    const detail = buildItemDetail(state, 'MOT-001');
    expect(detail?.tree.children.some((node) => node.id === 'MOT-001') || detail?.id).toBeTruthy();
    const engineNode =
      detail?.tree.id === 'MOT-001'
        ? detail.tree
        : detail?.tree.children.find((node) => node.id === 'MOT-001');
    expect(engineNode?.children.some((node) => node.id === 'FIL-002')).toBe(true);
    expect(state.items.find((entry) => entry.id === 'MOT-001')?.complete).toBe(true);
  });

  it('registers a present catalog slot that is itself an assembly with its nested baseline', () => {
    const state = createInitialState();
    const admin = state.users[0]!;
    const truckCategory = state.categories.find((category) => category.id === 'CAT-TRK')!;
    state.categories.push({
      id: 'CAT-AUX-ENG',
      name: 'Motor auxiliar',
      codePrefix: 'AUX',
      isAssembly: true,
      expectedComponents: ['Alternador'],
    });
    state.itemCodeSeq['CAT-AUX-ENG'] = 1;
    backfillPendingExpectedComponents(state, admin, truckCategory, ['Motor auxiliar']);

    const result = resolveCatalogReview(state, admin, {
      itemId: 'CAM-001',
      expectedComponentName: 'Motor auxiliar',
      decision: 'PRESENT',
      item: {
        name: 'Motor auxiliar recibido',
        categoryId: 'CAT-AUX-ENG',
        condition: 'USED',
      },
      baseline: [{ expectedComponentName: 'Alternador', status: 'MISSING' }],
    });

    expect(result.ok).toBe(true);
    expect(state.items.find((entry) => entry.id === 'AUX-001')).toMatchObject({
      parentId: 'CAM-001',
      physicalRelationship: 'INSTALLED',
      complete: false,
    });
    expect(state.knownMissing).toContainEqual(
      expect.objectContaining({
        parentId: 'AUX-001',
        expectedComponentName: 'Alternador',
        origin: 'MISSING_AT_RECEIPT',
      }),
    );
    expect(
      state.pendingCatalogReviews.some(
        (entry) => entry.parentId === 'CAM-001' && entry.expectedComponentName === 'Motor auxiliar',
      ),
    ).toBe(false);
  });
});

describe('quantity stock receipt and adjustment', () => {
  function registerAverageSample(state: ReturnType<typeof createInitialState>) {
    return registerQtyProduct(state, SELLER, {
      id: 'QTY-AVG-001',
      name: 'Producto promedio',
      categoryId: 'CAT-FIL',
      initialQuantity: 10,
      unitCostDop: 100,
    });
  }

  it('QTY-003: weighted-average receipt of 10 at 200 against 10 at 100 yields 20 at 150', () => {
    const state = createInitialState();
    expect(registerAverageSample(state).ok).toBe(true);

    const result = receiveQtyStock(state, SELLER, {
      qtyProductId: 'QTY-AVG-001',
      quantity: 10,
      unitCostDop: 200,
    });

    expect(result.ok).toBe(true);
    expect(state.qtyProducts.find((product) => product.id === 'QTY-AVG-001')).toMatchObject({
      onHand: 20,
      unitCostDop: 150,
    });
    expect(state.events.some((event) => event.type === 'QTY_STOCK_RECEIVED')).toBe(true);
  });

  it('QTY-001: seller can receive quantity stock', () => {
    const state = createInitialState();
    expect(registerAverageSample(state).ok).toBe(true);

    const result = receiveQtyStock(state, SELLER, {
      qtyProductId: 'QTY-AVG-001',
      quantity: 5,
      unitCostDop: 120,
    });

    expect(result.ok).toBe(true);
    expect(state.qtyProducts.find((product) => product.id === 'QTY-AVG-001')?.onHand).toBe(15);
    expect(
      buildQtyProductDetail(state, 'QTY-AVG-001')?.events.find(
        (event) => event.type === 'QTY_STOCK_RECEIVED',
      ),
    ).toMatchObject({
      actorName: 'Laura Pérez',
    });
  });

  it('QTY-001: seller cannot adjust quantity stock', () => {
    const state = createInitialState();
    expect(registerAverageSample(state).ok).toBe(true);

    const result = adjustQtyStock(state, SELLER, {
      qtyProductId: 'QTY-AVG-001',
      difference: 1,
      reason: 'Corrección de conteo',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
    expect(state.qtyProducts.find((product) => product.id === 'QTY-AVG-001')?.onHand).toBe(10);
  });

  it('QTY-001: administrator can adjust quantity and cannot reduce on-hand below reserved', () => {
    const state = createInitialState();
    expect(registerAverageSample(state).ok).toBe(true);
    const product = state.qtyProducts.find((entry) => entry.id === 'QTY-AVG-001')!;
    product.reserved = 4;
    const unitCostBefore = product.unitCostDop;

    const tooLow = adjustQtyStock(state, ADMIN, {
      qtyProductId: 'QTY-AVG-001',
      difference: -7,
      reason: 'Conteo físico',
    });
    expect(tooLow.ok).toBe(false);
    expect(product.onHand).toBe(10);

    const allowed = adjustQtyStock(state, ADMIN, {
      qtyProductId: 'QTY-AVG-001',
      difference: -6,
      reason: 'Conteo físico',
    });
    expect(allowed.ok).toBe(true);
    expect(product.onHand).toBe(4);
    expect(product.unitCostDop).toBe(unitCostBefore);
    expect(state.events.some((event) => event.type === 'QTY_STOCK_ADJUSTED')).toBe(true);
  });

  it('QTY-001: rejects zero or negative receipt quantity', () => {
    const state = createInitialState();
    expect(registerAverageSample(state).ok).toBe(true);

    const zero = receiveQtyStock(state, SELLER, {
      qtyProductId: 'QTY-AVG-001',
      quantity: 0,
      unitCostDop: 100,
    });
    const negative = receiveQtyStock(state, SELLER, {
      qtyProductId: 'QTY-AVG-001',
      quantity: -1,
      unitCostDop: 100,
    });

    expect(zero.ok).toBe(false);
    expect(negative.ok).toBe(false);
    expect(state.qtyProducts.find((product) => product.id === 'QTY-AVG-001')?.onHand).toBe(10);
  });

  it('INV-005: seller can enrich name, photos and location without rewriting identity or cost', () => {
    const state = createInitialState();
    const item = state.items.find((entry) => entry.id === 'FIL-001')!;
    const registeredEvents = state.events.filter(
      (event) => event.type === 'ITEM_REGISTERED' && event.metadata?.itemId === 'FIL-001',
    );

    const result = updateItemDetails(state, SELLER, {
      itemId: 'FIL-001',
      name: 'Filtro HD corregido',
      brand: 'Fleetguard',
      partNumber: 'LF9009',
      condition: 'USED',
      location: 'Estante 4',
      notes: 'Foto de etiqueta ilegible',
      photos: ['filtro-frente.jpg', 'filtro-etiqueta.jpg'],
    });

    expect(result.ok).toBe(true);
    expect(item).toMatchObject({
      id: 'FIL-001',
      categoryId: 'CAT-FIL',
      name: 'Filtro HD corregido',
      condition: 'USED',
      location: 'Estante 4',
      acquisitionCostDop: 850,
      commercialState: 'AVAILABLE',
      physicalRelationship: 'INDEPENDENT',
      photos: ['filtro-frente.jpg', 'filtro-etiqueta.jpg'],
    });
    expect(item.attributes).toBeUndefined();
    expect(state.events.filter((event) => event.type === 'ITEM_REGISTERED')).toHaveLength(
      registeredEvents.length,
    );
    expect(state.events.find((event) => event.type === 'ITEM_EDITED')?.metadata).toMatchObject({
      itemId: 'FIL-001',
      changes: {
        name: { before: 'Filtro de aceite HD', after: 'Filtro HD corregido' },
        location: { before: 'Estante 3', after: 'Estante 4' },
      },
    });
  });

  it('INV-005: ignores protected identity fields and does not rewrite sold invoice snapshots', () => {
    const state = createInitialState();
    const turbo = state.items.find((entry) => entry.id === 'TUR-009')!;
    const invoiceLine = state.invoices
      .flatMap((invoice) => invoice.lines)
      .find((line) => line.itemId === 'TUR-009');
    const snapshotDescription = invoiceLine?.description;
    const costBefore = turbo.acquisitionCostDop;

    const result = updateItemDetails(state, ADMIN, {
      itemId: 'TUR-009',
      name: 'Turbo mal rotulado',
      brand: 'Garrett',
      partNumber: 'TUR-GT4094',
      condition: 'USED',
      photos: ['turbo.jpg'],
    });

    expect(result.ok).toBe(true);
    expect(turbo.name).toBe('Turbo mal rotulado');
    expect(turbo.id).toBe('TUR-009');
    expect(turbo.categoryId).toBe('CAT-TUR');
    expect(turbo.acquisitionCostDop).toBe(costBefore);
    expect(turbo.parentId).toBe('MOT-001');
    expect(turbo.commercialState).toBe('SOLD');
    expect(invoiceLine?.description).toBe(snapshotDescription);
  });

  it('INV-005: rejects installing a free-text location on an installed descendant', () => {
    const state = createInitialState();
    const alt = state.items.find((entry) => entry.id === 'ALT-004')!;
    const eventCount = state.events.length;

    const result = updateItemDetails(state, ADMIN, {
      itemId: 'ALT-004',
      name: alt.name,
      condition: alt.condition,
      location: 'Cajón B',
    });

    expect(result.ok).toBe(false);
    expect(alt.location).toBeUndefined();
    expect(state.events).toHaveLength(eventCount);
  });

  it('INV-005: seller can edit quantity product labels without changing SKU or stock', () => {
    const state = createInitialState();
    const product = state.qtyProducts.find((entry) => entry.id === 'QTY-OIL-15W40')!;
    const onHand = product.onHand;
    const reserved = product.reserved;
    const unitCost = product.unitCostDop;

    const result = updateQtyProductDetails(state, SELLER, {
      qtyProductId: 'QTY-OIL-15W40',
      name: 'Aceite 15W-40 Galón (corregido)',
      brand: 'Valvoline',
      location: 'Estante aceite',
    });

    expect(result.ok).toBe(true);
    expect(product).toMatchObject({
      id: 'QTY-OIL-15W40',
      name: 'Aceite 15W-40 Galón (corregido)',
      brand: 'Valvoline',
      location: 'Estante aceite',
      onHand,
      reserved,
      unitCostDop: unitCost,
    });
  });
});
