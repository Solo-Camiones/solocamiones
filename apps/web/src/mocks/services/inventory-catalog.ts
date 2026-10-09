import type {
  DraftEligibility,
  HierarchyNode,
  InventoryListFilters,
  InventoryListRow,
  InventoryQuickFilter,
  ItemDetailView,
  QtyProductDetailView,
} from '../../api/contracts/inventory';
import type { AppState, Category, Item, QtyProduct, WorkOrder } from '../../api/contracts/entities';
import {
  ancestorChain,
  availableToReserve,
  effectiveLocation,
  isAssemblyItem,
  isComplete,
  itemById,
  overlappingReservation,
  protectedAncestor,
  reservationEffect,
} from './inventory-helpers';
import { toHistoryEventView } from './history-view';

function categoryName(categories: Category[], categoryId: string): string {
  return categories.find((entry) => entry.id === categoryId)?.name ?? categoryId;
}

function matchesQuery(item: Item, categoryLabel: string, query: string): boolean {
  const haystack = [
    item.id,
    item.name,
    categoryLabel,
    item.brand,
    item.model,
    item.partNumber,
    item.serial,
    ...Object.values(item.attributes ?? {}),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

function matchesQtyQuery(product: QtyProduct, categoryLabel: string, query: string): boolean {
  const haystack = [product.id, product.name, categoryLabel, product.brand]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

function openDraftId(state: AppState): string | undefined {
  return state.invoices.find((invoice) => invoice.status === 'DRAFT')?.id;
}

function itemDraftEligibility(state: AppState, item: Item): DraftEligibility {
  if (item.commercialState === 'SOLD') {
    return { allowed: false, reason: 'Este ítem ya está vendido' };
  }

  const restriction = protectedAncestor(state.items, item);
  if (restriction && restriction.id !== item.id) {
    return {
      allowed: false,
      reason: `No desarmar en ${restriction.id} impide vender este componente por separado`,
    };
  }

  const draftId = openDraftId(state);
  if (item.reservedByDraftId && draftId && item.reservedByDraftId !== draftId) {
    return {
      allowed: false,
      reason: `Reservado en el borrador ${item.reservedByDraftId}`,
    };
  }

  const overlap = overlappingReservation(state.items, item, draftId ?? '');
  if (overlap) {
    return {
      allowed: false,
      reason: `Hay una reserva solapada en ${overlap.id}`,
    };
  }

  return { allowed: true };
}

function qtyDraftEligibility(product: QtyProduct): DraftEligibility {
  const available = availableToReserve(product.onHand, product.reserved);
  if (available <= 0) {
    return { allowed: false, reason: 'No hay unidades disponibles para reservar' };
  }

  return { allowed: true };
}

function toItemRow(state: AppState, item: Item): InventoryListRow {
  const restriction = protectedAncestor(state.items, item);
  const parent = item.parentId ? itemById(state.items, item.parentId) : undefined;
  const hold = reservationEffect(state.items, item);

  return {
    kind: 'ITEM',
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    categoryName: categoryName(state.categories, item.categoryId),
    brand: item.brand,
    partNumber: item.partNumber,
    serial: item.serial,
    effectiveLocation: effectiveLocation(state.items, item),
    commercialState: item.commercialState,
    physicalRelationship: item.physicalRelationship,
    parentId: item.parentId,
    parentName: parent?.name,
    isAssembly: isAssemblyItem(item, state.categories),
    complete: isComplete(item, state.knownMissing, state.categories),
    reserved: hold.reserved,
    reservedByDraftId: hold.reservedByDraftId,
    noDesarmar: Boolean(restriction),
    protectedRootId: restriction?.id,
  };
}

function toQtyRow(state: AppState, product: QtyProduct): InventoryListRow {
  const available = availableToReserve(product.onHand, product.reserved);

  return {
    kind: 'QTY',
    id: product.id,
    name: product.name,
    categoryId: product.categoryId,
    categoryName: categoryName(state.categories, product.categoryId),
    brand: product.brand,
    effectiveLocation: product.location,
    commercialState: available > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
    reserved: product.reserved > 0,
    noDesarmar: false,
    qtyOnHand: product.onHand,
    qtyReserved: product.reserved,
    qtyAvailable: available,
  };
}

function activeWorkForPiece(state: AppState, pieceId: string) {
  const order = state.workOrders.find(
    (entry) =>
      entry.pieceId === pieceId && (entry.status === 'PENDING' || entry.status === 'IN_PROGRESS'),
  );
  if (!order) {
    return undefined;
  }

  return { id: order.id, type: order.type, status: order.status };
}

function toHierarchyNode(
  state: AppState,
  node: Item,
  options: { children: HierarchyNode[]; includeMissingSlots: boolean },
): HierarchyNode {
  const restriction = protectedAncestor(state.items, node);
  const parent = node.parentId ? itemById(state.items, node.parentId) : undefined;

  return {
    id: node.id,
    name: node.name,
    parentId: node.parentId,
    parentName: parent?.name,
    commercialState: node.commercialState,
    physicalRelationship: node.physicalRelationship,
    isAssembly: isAssemblyItem(node, state.categories),
    complete: isComplete(node, state.knownMissing, state.categories),
    noDesarmar: Boolean(restriction),
    protectedRootId: restriction?.id,
    activeWork: activeWorkForPiece(state, node.id),
    missingSlots: options.includeMissingSlots
      ? state.knownMissing
          .filter((entry) => entry.parentId === node.id)
          .map((entry) => ({
            id: entry.id,
            name: entry.expectedComponentName,
            origin: entry.origin,
            formerItemId: entry.formerItemId,
            workOrderId: entry.workOrderId,
          }))
      : [],
    children: options.children,
  };
}

/** Full physical subtree of one item: present children and this item's missing slots. */
function buildSubtree(state: AppState, node: Item): HierarchyNode {
  const children = state.items
    .filter((entry) => entry.parentId === node.id)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((child) => buildSubtree(state, child));

  return toHierarchyNode(state, node, { children, includeMissingSlots: true });
}

/**
 * Detail tree: ancestor spine (parent / camión) without siblings, plus this item's descendants.
 * Viewing an installed engine must not list other truck-level parts (e.g. missing transmisión).
 */
function buildFocusedTree(state: AppState, focus: Item): HierarchyNode {
  let tree = buildSubtree(state, focus);
  const ancestors = ancestorChain(state.items, focus);

  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (!ancestor) {
      continue;
    }
    tree = toHierarchyNode(state, ancestor, {
      children: [tree],
      includeMissingSlots: false,
    });
  }

  return tree;
}

function eventsForSubject(
  state: AppState,
  metadataKey: 'itemId' | 'qtyProductId',
  subjectId: string,
) {
  return state.events
    .filter((event) => event.metadata?.[metadataKey] === subjectId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((event) => toHistoryEventView(event, state.users));
}

function workOrdersForPiece(orders: WorkOrder[], pieceId: string): WorkOrder[] {
  return [...orders]
    .filter((order) => order.pieceId === pieceId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function matchesQuickFilter(row: InventoryListRow, key: InventoryQuickFilter): boolean {
  switch (key) {
    case 'available':
      return row.commercialState === 'AVAILABLE';
    case 'installed':
      return row.physicalRelationship === 'INSTALLED';
    case 'independent':
      return row.physicalRelationship === 'INDEPENDENT';
    case 'reserved':
      return row.reserved;
    case 'assemblies':
      return row.isAssembly === true;
    case 'incomplete':
      return row.complete === false;
    case 'quantity':
      return row.kind === 'QTY';
  }
}

/** Quick chips combine with AND. QTY rows have no physicalRelationship or condition. */
function matchesRowFilters(
  row: InventoryListRow,
  filters: InventoryListFilters,
  pendingParentIds: Set<string> | undefined,
): boolean {
  if (filters.kind && row.kind !== filters.kind) {
    return false;
  }
  if (filters.commercialState && row.commercialState !== filters.commercialState) {
    return false;
  }
  const locationNeedle = filters.location?.trim().toLowerCase();
  if (locationNeedle && !(row.effectiveLocation ?? '').toLowerCase().includes(locationNeedle)) {
    return false;
  }
  if (pendingParentIds && !pendingParentIds.has(row.id)) {
    return false;
  }
  return (filters.quick ?? []).every((key) => matchesQuickFilter(row, key));
}

/** Unified catalog: individual pieces + quantity products. */
export function buildInventoryCatalog(
  state: AppState,
  filters: InventoryListFilters = {},
): InventoryListRow[] {
  const query = filters.query?.trim().toLowerCase() ?? '';
  const includeSold = filters.includeSold === true;
  const categoryId = filters.categoryId?.trim() || undefined;
  const pendingParentIds = filters.pendingCatalog
    ? new Set(state.pendingCatalogReviews.map((entry) => entry.parentId))
    : undefined;

  const itemRows = state.items
    .filter((item) => includeSold || item.commercialState !== 'SOLD')
    .filter((item) => !categoryId || item.categoryId === categoryId)
    .filter((item) => !filters.condition || item.condition === filters.condition)
    .filter((item) => {
      if (!query) {
        return true;
      }
      return matchesQuery(item, categoryName(state.categories, item.categoryId), query);
    })
    .map((item) => toItemRow(state, item))
    .filter((row) => matchesRowFilters(row, filters, pendingParentIds));

  const qtyRows = state.qtyProducts
    .filter((product) => !categoryId || product.categoryId === categoryId)
    .filter((product) => {
      // Qty products have no condition; a condition filter excludes them.
      if (filters.condition) {
        return false;
      }
      if (!query) {
        return true;
      }
      return matchesQtyQuery(product, categoryName(state.categories, product.categoryId), query);
    })
    .map((product) => toQtyRow(state, product))
    .filter((row) => matchesRowFilters(row, filters, pendingParentIds));

  return [...itemRows, ...qtyRows].sort((left, right) => left.id.localeCompare(right.id));
}

export function buildItemDetail(state: AppState, id: string): ItemDetailView | undefined {
  const item = itemById(state.items, id);
  if (!item) {
    return undefined;
  }

  const restriction = protectedAncestor(state.items, item);
  const parent = item.parentId ? itemById(state.items, item.parentId) : undefined;
  const category = state.categories.find((entry) => entry.id === item.categoryId);
  const hold = reservationEffect(state.items, item);

  return {
    kind: 'ITEM',
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    categoryName: categoryName(state.categories, item.categoryId),
    isAssembly: category?.isAssembly === true,
    brand: item.brand,
    model: item.model,
    partNumber: item.partNumber,
    serial: item.serial,
    condition: item.condition,
    notes: item.notes,
    attributes: item.attributes,
    photos: [...item.photos],
    acquisitionCostDop: item.acquisitionCostDop,
    costProvenance: item.costProvenance,
    ownLocation: item.location,
    effectiveLocation: effectiveLocation(state.items, item),
    commercialState: item.commercialState,
    physicalRelationship: item.physicalRelationship,
    parentId: item.parentId,
    parentName: parent?.name,
    complete: isComplete(item, state.knownMissing, state.categories),
    reserved: hold.reserved,
    reservedByDraftId: hold.reservedByDraftId,
    noDesarmar: Boolean(restriction),
    protectedRootId: restriction?.id,
    missingComponents: state.knownMissing.filter((entry) => entry.parentId === item.id),
    pendingCatalogReviews: state.pendingCatalogReviews
      .filter((entry) => entry.parentId === item.id)
      .map((entry) => {
        const matchingCategory = state.categories.find(
          (category) => category.name === entry.expectedComponentName,
        );
        const matchedChild = entry.matchedChildId
          ? itemById(state.items, entry.matchedChildId)
          : undefined;
        return {
          id: entry.id,
          expectedComponentName: entry.expectedComponentName,
          kind: entry.kind,
          matchedChildId: entry.matchedChildId,
          matchedChildName: matchedChild?.name,
          matchingCategoryId: matchingCategory?.id,
        };
      }),
    catalogCategories: [...state.categories].sort((left, right) =>
      left.name.localeCompare(right.name, 'es'),
    ),
    soldInstalledChildren: state.items
      .filter(
        (child) =>
          child.parentId === item.id &&
          child.commercialState === 'SOLD' &&
          child.physicalRelationship === 'INSTALLED',
      )
      .map((child) => ({
        id: child.id,
        name: child.name,
        workOrderId: activeWorkForPiece(state, child.id)?.id,
      })),
    formerInstallation: (() => {
      const removed = state.knownMissing.find((entry) => entry.formerItemId === item.id);
      if (!removed) {
        return undefined;
      }
      const previousParent = itemById(state.items, removed.parentId);
      return {
        parentId: removed.parentId,
        parentName: previousParent?.name ?? removed.parentId,
        workOrderId: removed.workOrderId,
      };
    })(),
    ancestors: ancestorChain(state.items, item).map((entry) => ({
      id: entry.id,
      name: entry.name,
    })),
    tree: buildFocusedTree(state, item),
    workOrders: workOrdersForPiece(state.workOrders, item.id),
    events: eventsForSubject(state, 'itemId', item.id),
    draftEligibility: itemDraftEligibility(state, item),
  };
}

export function buildQtyProductDetail(
  state: AppState,
  id: string,
): QtyProductDetailView | undefined {
  const product = state.qtyProducts.find((entry) => entry.id === id);
  if (!product) {
    return undefined;
  }

  const available = availableToReserve(product.onHand, product.reserved);

  return {
    kind: 'QTY',
    id: product.id,
    name: product.name,
    categoryId: product.categoryId,
    categoryName: categoryName(state.categories, product.categoryId),
    brand: product.brand,
    location: product.location,
    photos: [],
    unitCostDop: product.unitCostDop,
    onHand: product.onHand,
    reserved: product.reserved,
    availableToReserve: available,
    commercialState: available > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
    draftEligibility: qtyDraftEligibility(product),
    events: eventsForSubject(state, 'qtyProductId', product.id),
  };
}
