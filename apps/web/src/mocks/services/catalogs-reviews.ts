import type {
  AppEvent,
  AppState,
  Category,
  Item,
  PendingCatalogReview,
  User,
} from '../../api/contracts/entities';
import { DEMO_NOW_ISO } from '../data/demo-clock';
import { catalogNameKey } from './catalogs';
import { isComplete } from './inventory-helpers';

function nextNumericId(ids: string[], prefix: string, pad: number): string {
  let max = 0;
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);

  for (const id of ids) {
    const match = pattern.exec(id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  return `${prefix}${String(max + 1).padStart(pad, '0')}`;
}

function appendEvent(
  state: AppState,
  type: string,
  description: string,
  actor: User,
  metadata?: Record<string, unknown>,
): AppEvent {
  const event: AppEvent = {
    id: nextNumericId(
      state.events.map((entry) => entry.id),
      'EV-',
      3,
    ),
    type,
    description,
    actorId: actor.id,
    createdAt: DEMO_NOW_ISO,
    metadata,
  };
  state.events.push(event);
  return event;
}

export function addedExpectedComponentNames(
  previous: string[] | undefined,
  next: string[] | undefined,
): string[] {
  const before = new Set((previous ?? []).map(catalogNameKey));
  return (next ?? []).filter((name) => !before.has(catalogNameKey(name)));
}

function categoryName(state: AppState, categoryId: string): string | undefined {
  return state.categories.find((entry) => entry.id === categoryId)?.name;
}

/** Current child whose category name matches the expected-component definition. */
export function findMatchingPresentChild(
  state: AppState,
  parentId: string,
  expectedComponentName: string,
): Item | undefined {
  return state.items
    .filter((child) => child.parentId === parentId)
    .sort((left, right) => left.id.localeCompare(right.id))
    .find((child) => categoryName(state, child.categoryId) === expectedComponentName);
}

function hasPendingReview(
  state: AppState,
  parentId: string,
  expectedComponentName: string,
): boolean {
  return state.pendingCatalogReviews.some(
    (entry) => entry.parentId === parentId && entry.expectedComponentName === expectedComponentName,
  );
}

function hasKnownMissing(
  state: AppState,
  parentId: string,
  expectedComponentName: string,
): boolean {
  return state.knownMissing.some(
    (entry) => entry.parentId === parentId && entry.expectedComponentName === expectedComponentName,
  );
}

function isUnsoldAssemblyOfCategory(item: Item, category: Category): boolean {
  return item.categoryId === category.id && item.commercialState !== 'SOLD';
}

function nextReviewId(state: AppState, created: PendingCatalogReview[]): string {
  return nextNumericId(
    [...state.pendingCatalogReviews.map((entry) => entry.id), ...created.map((entry) => entry.id)],
    'PCR-',
    3,
  );
}

/**
 * After an assembly category gains expected names:
 * - a current matching child is recorded as already present (stays in the tree);
 * - otherwise the unit gets a provisional NA review.
 * Completeness does not change unless an administrator later marks missing.
 */
export function backfillPendingExpectedComponents(
  state: AppState,
  actor: User,
  category: Category,
  addedNames: string[],
): PendingCatalogReview[] {
  if (!category.isAssembly || addedNames.length === 0) {
    return [];
  }

  const created: PendingCatalogReview[] = [];

  for (const item of state.items) {
    if (!isUnsoldAssemblyOfCategory(item, category)) {
      continue;
    }

    for (const expectedComponentName of addedNames) {
      if (hasPendingReview(state, item.id, expectedComponentName)) {
        continue;
      }
      if (hasKnownMissing(state, item.id, expectedComponentName)) {
        continue;
      }

      const matchingChild = findMatchingPresentChild(state, item.id, expectedComponentName);
      if (matchingChild) {
        const review: PendingCatalogReview = {
          id: nextReviewId(state, created),
          parentId: item.id,
          expectedComponentName,
          kind: 'ALREADY_PRESENT',
          matchedChildId: matchingChild.id,
        };
        created.push(review);
        state.pendingCatalogReviews.push(review);
        appendEvent(
          state,
          'CATALOG_EXPECTED_MATCHED',
          `${item.id} ya tenía ${matchingChild.id} (${expectedComponentName})`,
          actor,
          {
            itemId: item.id,
            categoryId: category.id,
            expectedComponentName,
            matchedChildId: matchingChild.id,
            complete: isComplete(item, state.knownMissing, state.categories),
          },
        );
        continue;
      }

      const review: PendingCatalogReview = {
        id: nextReviewId(state, created),
        parentId: item.id,
        expectedComponentName,
        kind: 'PENDING_NA',
      };
      created.push(review);
      state.pendingCatalogReviews.push(review);
      appendEvent(
        state,
        'CATALOG_EXPECTED_ADDED',
        `${item.id} fue registrado y ahora espera ${expectedComponentName}`,
        actor,
        {
          itemId: item.id,
          categoryId: category.id,
          expectedComponentName,
          complete: isComplete(item, state.knownMissing, state.categories),
        },
      );
    }
  }

  return created;
}
