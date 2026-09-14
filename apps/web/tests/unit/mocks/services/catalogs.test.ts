import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../../../src/mocks/data/seed';
import {
  nextCategoryId,
  nextServiceId,
  prepareCategorySave,
  prepareServiceSave,
} from '../../../../src/mocks/services/catalogs';
import {
  addedExpectedComponentNames,
  backfillPendingExpectedComponents,
} from '../../../../src/mocks/services/catalogs-reviews';
import { isComplete } from '../../../../src/mocks/services/inventory-helpers';

describe('prepareCategorySave', () => {
  const seedCategories = createInitialState().categories;

  it('creates a unique assembly category without touching inventory', () => {
    expect(nextCategoryId(seedCategories, 'Bomba')).toBe('CAT-BOMBA');

    const result = prepareCategorySave(seedCategories, {
      name: '  Bomba  ',
      codePrefix: 'bom',
      isAssembly: true,
      expectedComponents: ['Disco', '  Tuerca  ', ''],
      attributes: [{ key: 'flow', label: 'Caudal', type: 'text' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        id: 'CAT-BOMBA',
        name: 'Bomba',
        codePrefix: 'BOM',
        isAssembly: true,
        expectedComponents: ['Disco', 'Tuerca'],
        attributes: [{ key: 'flow', label: 'Caudal', type: 'text' }],
      });
    }
    expect(createInitialState().items).toHaveLength(createInitialState().items.length);
  });

  it('rejects a missing or duplicate item-code prefix on create', () => {
    const missing = prepareCategorySave(seedCategories, {
      name: 'Bomba',
      isAssembly: false,
    });
    const duplicate = prepareCategorySave(seedCategories, {
      name: 'Motor usado',
      codePrefix: 'mot',
      isAssembly: false,
    });

    expect(missing.ok).toBe(false);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error.message).toContain('MOT');
    }
  });

  it('rejects a duplicate expected-component name on save', () => {
    const result = prepareCategorySave(seedCategories, {
      id: 'CAT-ENG',
      name: 'Motor',
      isAssembly: true,
      expectedComponents: ['Alternador', 'Turbo', 'Motor de arranque', 'alternador'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toContain('alternador');
    }
  });

  it('preserves canonical component spelling for a case-only edit', () => {
    const result = prepareCategorySave(seedCategories, {
      id: 'CAT-ENG',
      name: 'Motor',
      isAssembly: true,
      expectedComponents: ['Alternador', 'turbo', 'Motor de arranque'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.expectedComponents).toEqual([
        'Alternador',
        'Turbo',
        'Motor de arranque',
      ]);
      expect(result.value.attributes).toEqual([
        { key: 'displacement', label: 'Cilindrada', type: 'text' },
      ]);
    }
  });

  it('rejects an assembly without expected components', () => {
    const result = prepareCategorySave(seedCategories, {
      name: 'Caja',
      codePrefix: 'CAJ',
      isAssembly: true,
      expectedComponents: ['  '],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('edits a seed category without rewriting its id', () => {
    const result = prepareCategorySave(seedCategories, {
      id: 'CAT-FIL',
      name: 'Filtros HD',
      isAssembly: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('CAT-FIL');
      expect(result.value.name).toBe('Filtros HD');
      expect(result.value.codePrefix).toBe('FIL');
      expect(result.value.expectedComponents).toBeUndefined();
    }
  });

  it('rejects duplicate category attribute keys', () => {
    const result = prepareCategorySave(seedCategories, {
      name: 'Sensor',
      codePrefix: 'SEN',
      isAssembly: false,
      attributes: [
        { key: 'voltage', label: 'Voltaje', type: 'text' },
        { key: 'voltage', label: 'Voltios', type: 'text' },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('returns NOT_FOUND for an unknown category id', () => {
    const result = prepareCategorySave(seedCategories, {
      id: 'CAT-MISSING',
      name: 'Fantasma',
      isAssembly: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});

describe('prepareServiceSave', () => {
  const seedServices = createInitialState().services;

  it('creates the next service id from the name', () => {
    expect(nextServiceId(seedServices, 'Alineación')).toBe('SVC-ALINEACI');

    const result = prepareServiceSave(seedServices, {
      name: 'Alineación',
      active: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        id: 'SVC-ALINEACI',
        name: 'Alineación',
        active: true,
      });
    }
  });

  it('rejects a duplicate service name', () => {
    const result = prepareServiceSave(seedServices, {
      name: 'instalación mecánica',
      active: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('can deactivate an existing service', () => {
    const result = prepareServiceSave(seedServices, {
      id: 'SVC-INST',
      active: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        name: 'Instalación mecánica',
        active: false,
      });
    }
  });

  it('can rename an existing service without changing its active state', () => {
    const result = prepareServiceSave(seedServices, {
      id: 'SVC-INST',
      name: 'Instalación especializada',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        name: 'Instalación especializada',
        active: true,
      });
    }
  });
});

describe('catalog expected-component backfill', () => {
  const admin = createInitialState().users[0]!;

  it('detects only newly added expected names', () => {
    expect(
      addedExpectedComponentNames(
        ['Alternador', 'Turbo', 'Motor de arranque'],
        ['Alternador', 'Turbo', 'Motor de arranque', 'Bomba de aceite'],
      ),
    ).toEqual(['Bomba de aceite']);
    expect(addedExpectedComponentNames(['Turbo'], ['turbo'])).toEqual([]);
  });

  it('adds provisional NA to unsold assemblies without changing completeness', () => {
    const state = createInitialState();
    const engine = state.categories.find((category) => category.id === 'CAT-ENG')!;
    const created = backfillPendingExpectedComponents(state, admin, engine, ['Bomba de aceite']);

    expect(created.map((entry) => entry.parentId).sort()).toEqual(['MOT-001', 'MOT-002', 'MOT-003']);
    expect(
      isComplete(state.items.find((item) => item.id === 'MOT-001')!, state.knownMissing, state.categories),
    ).toBe(true);
    expect(
      isComplete(state.items.find((item) => item.id === 'MOT-002')!, state.knownMissing, state.categories),
    ).toBe(false);
    expect(
      state.knownMissing.some((entry) => entry.expectedComponentName === 'Bomba de aceite'),
    ).toBe(false);
    expect(state.events.some((event) => event.type === 'CATALOG_EXPECTED_ADDED')).toBe(true);
  });

  it('skips sold assemblies and slots already present or missing', () => {
    const state = createInitialState();
    const sold = state.items.find((item) => item.id === 'MOT-003')!;
    sold.commercialState = 'SOLD';
    const engine = state.categories.find((category) => category.id === 'CAT-ENG')!;

    const created = backfillPendingExpectedComponents(state, admin, engine, [
      'Bomba de aceite',
      'Alternador',
    ]);

    expect(created.every((entry) => entry.parentId !== 'MOT-003')).toBe(true);
    expect(
      created
        .filter((entry) => entry.expectedComponentName === 'Bomba de aceite')
        .map((entry) => entry.parentId)
        .sort(),
    ).toEqual(['MOT-001', 'MOT-002']);
    expect(
      created.find(
        (entry) => entry.parentId === 'MOT-001' && entry.expectedComponentName === 'Alternador',
      ),
    ).toMatchObject({ kind: 'ALREADY_PRESENT', matchedChildId: 'ALT-004' });
    expect(
      created.some(
        (entry) => entry.parentId === 'MOT-002' && entry.expectedComponentName === 'Alternador',
      ),
    ).toBe(false);
  });

  it('records an already-installed matching child as present in the tree', () => {
    const state = createInitialState();
    const admin = state.users[0]!;
    const engine = state.categories.find((category) => category.id === 'CAT-ENG')!;
    const created = backfillPendingExpectedComponents(state, admin, engine, ['Alternador']);

    expect(created.find((entry) => entry.parentId === 'MOT-001')).toMatchObject({
      kind: 'ALREADY_PRESENT',
      matchedChildId: 'ALT-004',
    });
    expect(state.items.find((item) => item.id === 'ALT-004')?.parentId).toBe('MOT-001');
    expect(state.events.some((event) => event.type === 'CATALOG_EXPECTED_MATCHED')).toBe(true);
  });
});
