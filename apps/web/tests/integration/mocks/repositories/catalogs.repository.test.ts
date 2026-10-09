import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mockCategoryRepository } from '../../../../src/mocks/repositories/MockCategoryRepository';
import { mockServiceRepository } from '../../../../src/mocks/repositories/MockServiceRepository';
import { mockSalesRepository } from '../../../../src/mocks/repositories/MockSalesRepository';
import { getMockState, resetMockState } from '../../../../src/mocks/state';
import { signInAs } from '../../../support/session';

describe('MockCategoryRepository', () => {
  beforeEach(() => {
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('lets a seller read categories for inventory registration', async () => {
    signInAs('SELLER');

    const listed = await mockCategoryRepository.list();

    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value.some((category) => category.id === 'CAT-ENG')).toBe(true);
    }
  });

  it('persists a new category in shared mock state', async () => {
    signInAs('ADMINISTRATOR');

    const saved = await mockCategoryRepository.save({
      name: 'Bomba',
      codePrefix: 'BOM',
      isAssembly: true,
      expectedComponents: ['Disco', 'Tuerca'],
    });
    const listed = await mockCategoryRepository.list();

    expect(saved.ok).toBe(true);
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value).toContainEqual(
        expect.objectContaining({
          id: 'CAT-BOMBA',
          name: 'Bomba',
          codePrefix: 'BOM',
          isAssembly: true,
        }),
      );
    }
    expect(getMockState().items.every((item) => item.categoryId !== 'CAT-BOMBA')).toBe(true);
  });

  it('backfills unsold motors including an installed engine when a new expected component is added', async () => {
    signInAs('ADMINISTRATOR');

    const saved = await mockCategoryRepository.save({
      id: 'CAT-ENG',
      name: 'Motor',
      isAssembly: true,
      expectedComponents: ['Alternador', 'Turbo', 'Motor de arranque', 'Bomba de aceite'],
    });

    expect(saved.ok).toBe(true);
    const reviews = getMockState().pendingCatalogReviews;
    expect(reviews.map((entry) => entry.parentId).sort()).toEqual([
      'MOT-001',
      'MOT-002',
      'MOT-003',
    ]);
    expect(reviews.every((entry) => entry.expectedComponentName === 'Bomba de aceite')).toBe(true);
    expect(getMockState().items.find((item) => item.id === 'MOT-001')?.complete).toBe(true);
    expect(getMockState().items.find((item) => item.id === 'MOT-002')?.complete).toBe(false);
  });

  it('rejects a repeated expected-component name without changing the category', async () => {
    signInAs('ADMINISTRATOR');
    const before = getMockState().categories.find((category) => category.id === 'CAT-ENG');

    const saved = await mockCategoryRepository.save({
      id: 'CAT-ENG',
      name: 'Motor',
      isAssembly: true,
      expectedComponents: ['Alternador', 'Turbo', 'Motor de arranque', 'Alternador'],
    });

    expect(saved.ok).toBe(false);
    if (!saved.ok) {
      expect(saved.error.code).toBe('VALIDATION');
    }
    expect(getMockState().categories.find((category) => category.id === 'CAT-ENG')).toEqual(before);
  });

  it('renames live category references in one state commit', async () => {
    signInAs('ADMINISTRATOR');
    const state = getMockState();
    state.pendingCatalogReviews.push({
      id: 'PCR-001',
      parentId: 'MOT-003',
      expectedComponentName: 'Alternador',
      kind: 'PENDING_NA',
    });

    const saved = await mockCategoryRepository.save({
      id: 'CAT-ALT',
      name: 'Alternador HD',
      isAssembly: false,
    });

    expect(saved.ok).toBe(true);
    expect(
      getMockState().categories.find((category) => category.id === 'CAT-ENG')?.expectedComponents,
    ).toContain('Alternador HD');
    expect(getMockState().knownMissing.find((entry) => entry.id === 'KM-003')).toMatchObject({
      expectedComponentName: 'Alternador HD',
    });
    expect(
      getMockState().pendingCatalogReviews.find((entry) => entry.id === 'PCR-001'),
    ).toMatchObject({ expectedComponentName: 'Alternador HD' });
  });

  it('rejects changing the assembly kind of a category with inventory', async () => {
    signInAs('ADMINISTRATOR');
    const before = structuredClone(getMockState());

    const saved = await mockCategoryRepository.save({
      id: 'CAT-FIL',
      name: 'Filtros',
      isAssembly: true,
      expectedComponents: ['Cartucho'],
    });

    expect(saved.ok).toBe(false);
    if (!saved.ok) {
      expect(saved.error.code).toBe('CONFLICT');
    }
    expect(getMockState()).toEqual(before);
  });

  it('does not drop pending reviews when an expected name is later removed from the catalog', async () => {
    signInAs('ADMINISTRATOR');

    await mockCategoryRepository.save({
      id: 'CAT-ENG',
      name: 'Motor',
      isAssembly: true,
      expectedComponents: ['Alternador', 'Turbo', 'Motor de arranque', 'Bomba de aceite'],
    });
    const afterAdd = getMockState().pendingCatalogReviews.length;

    const saved = await mockCategoryRepository.save({
      id: 'CAT-ENG',
      name: 'Motor',
      isAssembly: true,
      expectedComponents: ['Alternador', 'Turbo', 'Motor de arranque'],
    });

    expect(saved.ok).toBe(true);
    expect(getMockState().pendingCatalogReviews).toHaveLength(afterAdd);
  });

  it('denies seller writes and mechanic reads', async () => {
    signInAs('SELLER');
    const sellerWrite = await mockCategoryRepository.save({
      name: 'Intruso',
      isAssembly: false,
    });
    expect(sellerWrite.ok).toBe(false);
    if (!sellerWrite.ok) {
      expect(sellerWrite.error.code).toBe('FORBIDDEN');
    }

    signInAs('MECHANIC');
    const mechanicRead = await mockCategoryRepository.list();
    expect(mechanicRead.ok).toBe(false);
    if (!mechanicRead.ok) {
      expect(mechanicRead.error.code).toBe('FORBIDDEN');
    }
  });
});

describe('MockServiceRepository', () => {
  beforeEach(() => {
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('hides a deactivated service from the POS draft catalog', async () => {
    signInAs('ADMINISTRATOR');

    const saved = await mockServiceRepository.save({
      id: 'SVC-INST',
      name: 'Instalación mecánica',
      active: false,
    });
    expect(saved.ok).toBe(true);

    signInAs('SELLER');
    const draft = await mockSalesRepository.getDraft('INV-DRAFT-01');
    expect(draft.ok).toBe(true);
    if (draft.ok) {
      expect(draft.value.services.map((service) => service.id)).toEqual(['SVC-DES']);
      expect(draft.value.services.some((service) => service.id === 'SVC-DIAG')).toBe(false);
    }
  });

  it('denies seller access to the full service catalog', async () => {
    signInAs('SELLER');

    const listed = await mockServiceRepository.list();

    expect(listed.ok).toBe(false);
    if (!listed.ok) {
      expect(listed.error.code).toBe('FORBIDDEN');
    }
  });
});
