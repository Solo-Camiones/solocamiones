import type { Category, Item, KnownMissingComponent } from '../../api/contracts/entities';

export function itemById(items: Item[], id: string): Item | undefined {
  return items.find((entry) => entry.id === id);
}

/** Walk to the current independent ancestor (the physical root). */
export function rootAncestor(items: Item[], item: Item): Item {
  const seen = new Set<string>();
  let current = item;

  while (current.parentId) {
    if (seen.has(current.id)) {
      break;
    }
    seen.add(current.id);
    const parent = itemById(items, current.parentId);
    if (!parent) {
      break;
    }
    current = parent;
  }

  return current;
}

/**
 * LOC-001: installed pieces inherit the root's free-text location.
 * Independent pieces use their own location (may be empty / pending).
 */
export function effectiveLocation(items: Item[], item: Item): string | undefined {
  if (item.physicalRelationship === 'INDEPENDENT' || !item.parentId) {
    return item.location;
  }

  return rootAncestor(items, item).location;
}

export function isAssemblyItem(item: Item, categories: Category[]): boolean {
  return categories.find((entry) => entry.id === item.categoryId)?.isAssembly === true;
}

/**
 * HIER-006 / INV-003: completeness is derived from unresolved Known Missing
 * Components on this direct parent only. Unique parts are not complete/incomplete.
 * A sold child that is still INSTALLED does not create a missing slot
 * (the sale can be cancelled before desarme).
 */
export function isComplete(
  item: Item,
  knownMissing: KnownMissingComponent[],
  categories: Category[],
): boolean | undefined {
  if (!isAssemblyItem(item, categories)) {
    return undefined;
  }

  return !knownMissing.some((entry) => entry.parentId === item.id);
}

/**
 * Cache derived completeness on the assembly row so other aggregates stay aligned.
 * Never call this to "choose" completeness; it only mirrors HIER-006.
 */
export function syncDirectParentCompleteness(
  item: Item,
  knownMissing: KnownMissingComponent[],
  categories: Category[],
): void {
  const derived = isComplete(item, knownMissing, categories);
  if (derived === undefined) {
    return;
  }
  item.complete = derived;
}

/**
 * HIER-008: first ancestor (including self) with `noDesarmar`.
 * Descendants inherit the restriction even without their own flag.
 */
export function protectedAncestor(items: Item[], item: Item): Item | undefined {
  const seen = new Set<string>();
  let current: Item | undefined = item;

  while (current) {
    if (seen.has(current.id)) {
      return undefined;
    }
    seen.add(current.id);

    if (current.noDesarmar) {
      return current;
    }

    current = current.parentId ? itemById(items, current.parentId) : undefined;
  }

  return undefined;
}

export function collectSubtree(items: Item[], rootId: string): Item[] {
  const result: Item[] = [];
  const queue = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    for (const child of items) {
      if (child.parentId === currentId) {
        result.push(child);
        queue.push(child.id);
      }
    }
  }

  return result;
}

export function ancestorChain(items: Item[], item: Item): Item[] {
  const chain: Item[] = [];
  const seen = new Set<string>();
  let current = item.parentId ? itemById(items, item.parentId) : undefined;

  while (current) {
    if (seen.has(current.id)) {
      break;
    }
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? itemById(items, current.parentId) : undefined;
  }

  return chain;
}

export function availableToReserve(onHand: number, reserved: number): number {
  return onHand - reserved;
}

/**
 * RES-001: an assembly reservation covers descendants; a child reservation
 * overlaps the parent. Same-draft ownership of *this* item is not a conflict.
 */
export function overlappingReservation(
  items: Item[],
  item: Item,
  draftId: string,
): Item | undefined {
  const related = [item, ...collectSubtree(items, item.id), ...ancestorChain(items, item)];

  return related.find((entry) => {
    if (!entry.reservedByDraftId) {
      return false;
    }
    if (entry.id === item.id && entry.reservedByDraftId === draftId) {
      return false;
    }
    return true;
  });
}

/**
 * SEARCH-002 / RES-001: descendants of a reserved assembly show the same hold.
 */
export function reservationEffect(
  items: Item[],
  item: Item,
): { reserved: boolean; reservedByDraftId?: string } {
  if (item.reservedByDraftId) {
    return { reserved: true, reservedByDraftId: item.reservedByDraftId };
  }

  const ancestors = ancestorChain(items, item);
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (ancestor?.reservedByDraftId) {
      return { reserved: true, reservedByDraftId: ancestor.reservedByDraftId };
    }
  }

  return { reserved: false };
}
