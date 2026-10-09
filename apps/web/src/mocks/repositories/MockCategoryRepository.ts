import type { SaveCategoryInput } from '../../api/contracts/catalogs';
import type { CategoryRepository } from '../../api/contracts/repositories';
import { ok } from '../../shared/auth/types';
import {
  addedExpectedComponentNames,
  backfillPendingExpectedComponents,
} from '../services/catalogs-reviews';
import {
  prepareCategorySave,
  prepareCategoryStateChange,
  sortCategories,
} from '../services/catalogs';
import { requireAnyPermission, requirePermission } from '../services/require-permission';
import { cloneForRead, getMockState } from '../state';

export class MockCategoryRepository implements CategoryRepository {
  async list() {
    const permission = requireAnyPermission(['inventory.view', 'catalogs.manage']);
    if (!permission.ok) {
      return permission;
    }

    return ok(cloneForRead(sortCategories(getMockState().categories)));
  }

  async save(input: SaveCategoryInput) {
    const permission = requirePermission('catalogs.manage');
    if (!permission.ok) {
      return permission;
    }

    const state = getMockState();
    const prepared = prepareCategorySave(state.categories, input);
    if (!prepared.ok) {
      return prepared;
    }

    const category = prepared.value;
    const previous = input.id ? state.categories.find((entry) => entry.id === input.id) : undefined;
    const addedNames =
      previous?.isAssembly === true
        ? addedExpectedComponentNames(previous.expectedComponents, category.expectedComponents)
        : [];

    const stateChange = prepareCategoryStateChange(state, category);
    if (!stateChange.ok) {
      return stateChange;
    }

    const staged = stateChange.value;
    const savedCategory = staged.categories.find((entry) => entry.id === category.id)!;

    if (addedNames.length > 0) {
      backfillPendingExpectedComponents(staged, permission.value, savedCategory, addedNames);
    }

    Object.assign(state, staged);

    return ok(cloneForRead(savedCategory));
  }
}

export const mockCategoryRepository = new MockCategoryRepository();
