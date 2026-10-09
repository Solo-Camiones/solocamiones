import type {
  Category,
  CommercialState,
  HistoryEventView,
  Item,
  ItemCondition,
  KnownMissingComponent,
  PhysicalRelationship,
  QtyProduct,
  WorkOrder,
  WorkOrderType,
} from './entities';

export type InventoryKind = 'ITEM' | 'QTY';

/** Quick chips on the inventory list. Combined with AND. Distinct from advanced fields. */
export type InventoryQuickFilter =
  'available' | 'installed' | 'independent' | 'reserved' | 'assemblies' | 'incomplete' | 'quantity';

/**
 * Inventory catalog filters.
 * URL query on `/inventory` (M3 owns parsing; M5 KPI links use the same keys):
 * q, category, sold=1, available=1, installed=1, independent=1, reserved=1,
 * assemblies=1, incomplete=1, quantity=1, location, condition,
 * commercial=AVAILABLE|SOLD|UNAVAILABLE, kind=ITEM|QTY, pendingCatalog=1
 */
export type InventoryListFilters = {
  query?: string;
  categoryId?: string;
  includeSold?: boolean;
  quick?: InventoryQuickFilter[];
  location?: string;
  condition?: ItemCondition;
  commercialState?: CommercialState | 'UNAVAILABLE';
  kind?: InventoryKind;
  pendingCatalog?: boolean;
};

export type DraftEligibility = {
  allowed: boolean;
  reason?: string;
};

export type InventoryListRow = {
  kind: InventoryKind;
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  brand?: string;
  partNumber?: string;
  serial?: string;
  effectiveLocation?: string;
  commercialState: CommercialState | 'UNAVAILABLE';
  physicalRelationship?: PhysicalRelationship;
  parentId?: string;
  parentName?: string;
  isAssembly?: boolean;
  complete?: boolean;
  reserved: boolean;
  reservedByDraftId?: string;
  noDesarmar: boolean;
  protectedRootId?: string;
  qtyOnHand?: number;
  qtyReserved?: number;
  qtyAvailable?: number;
};

export type HierarchyMissingSlot = {
  id: string;
  name: string;
  origin: KnownMissingComponent['origin'];
  formerItemId?: string;
  workOrderId?: string;
};

export type HierarchyActiveWork = {
  id: string;
  type: WorkOrder['type'];
  status: WorkOrder['status'];
};

export type HierarchyNode = {
  id: string;
  name: string;
  parentId?: string;
  parentName?: string;
  commercialState: CommercialState;
  physicalRelationship: PhysicalRelationship;
  isAssembly: boolean;
  complete?: boolean;
  noDesarmar: boolean;
  protectedRootId?: string;
  activeWork?: HierarchyActiveWork;
  missingSlots: HierarchyMissingSlot[];
  children: HierarchyNode[];
};

export type ItemDetailView = {
  kind: 'ITEM';
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  isAssembly: boolean;
  brand?: string;
  model?: string;
  partNumber?: string;
  serial?: string;
  condition: ItemCondition;
  notes?: string;
  attributes?: Record<string, string>;
  photos: string[];
  acquisitionCostDop?: number;
  costProvenance?: string;
  ownLocation?: string;
  effectiveLocation?: string;
  commercialState: CommercialState;
  physicalRelationship: PhysicalRelationship;
  parentId?: string;
  parentName?: string;
  complete?: boolean;
  reserved: boolean;
  reservedByDraftId?: string;
  noDesarmar: boolean;
  protectedRootId?: string;
  missingComponents: KnownMissingComponent[];
  /** Provisional NA slots from a later catalog expansion; admin confirms NA or marks missing. */
  pendingCatalogReviews: {
    id: string;
    expectedComponentName: string;
    kind: 'PENDING_NA' | 'ALREADY_PRESENT';
    matchedChildId?: string;
    matchedChildName?: string;
    matchingCategoryId?: string;
  }[];
  /** Category definitions needed to register nested assembly reviews atomically. */
  catalogCategories: Category[];
  soldInstalledChildren: { id: string; name: string; workOrderId?: string }[];
  formerInstallation?: { parentId: string; parentName: string; workOrderId?: string };
  ancestors: { id: string; name: string }[];
  tree: HierarchyNode;
  workOrders: WorkOrder[];
  events: HistoryEventView[];
  draftEligibility: DraftEligibility;
};

export type QtyProductDetailView = {
  kind: 'QTY';
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  brand?: string;
  location?: string;
  photos: string[];
  unitCostDop: number;
  onHand: number;
  reserved: number;
  availableToReserve: number;
  commercialState: CommercialState | 'UNAVAILABLE';
  draftEligibility: DraftEligibility;
  events: HistoryEventView[];
};

export type InventoryDetail = ItemDetailView | QtyProductDetailView;

export type AddToDraftInput = {
  itemId?: string;
  qtyProductId?: string;
  quantity?: number;
};

export type AddToDraftResult = {
  draftId: string;
  alreadyInDraft: boolean;
};

export type NoDesarmarInput = {
  itemId: string;
  enabled: boolean;
};

export type CostCorrectionInput = {
  itemId: string;
  acquisitionCostDop?: number;
  /** `null` explicitly clears a previously recorded provenance. */
  costProvenance?: string | null;
  reason: string;
};

export type BaselineCorrectionInput = {
  itemId: string;
  reason: string;
  markNotApplicable: string[];
};

export type ResolveCatalogReviewInput = {
  itemId: string;
  expectedComponentName: string;
  decision: 'NOT_APPLICABLE' | 'MISSING' | 'PRESENT' | 'ACKNOWLEDGE';
  /** Required when decision is PRESENT — new child identity installed on the parent. */
  item?: RegisterItemInput;
  /** Required when the PRESENT child is itself an assembly. */
  baseline?: AssemblyBaselineEntry[];
};

export type ManualWorkOrderInput = {
  pieceId: string;
  type: WorkOrderType;
  destinationParentId?: string;
  notes?: string;
};

export type RegisterItemInput = {
  name: string;
  categoryId: string;
  brand?: string;
  model?: string;
  serial?: string;
  partNumber?: string;
  condition: ItemCondition;
  acquisitionCostDop?: number;
  costProvenance?: string;
  location?: string;
  attributes?: Record<string, string>;
  notes?: string;
  photos?: string[];
};

/**
 * Ordinary INV-005 maintenance. Identity, category, cost, parent, and commercial
 * state are intentionally absent so they cannot be mass-assigned.
 */
export type UpdateItemDetailsInput = {
  itemId: string;
  name: string;
  brand?: string;
  model?: string;
  serial?: string;
  partNumber?: string;
  condition: ItemCondition;
  location?: string;
  attributes?: Record<string, string>;
  notes?: string;
  photos?: string[];
};

/** Ordinary quantity-product labels and free-text location. SKU, cost, and stock stay out. */
export type UpdateQtyProductDetailsInput = {
  qtyProductId: string;
  name: string;
  brand?: string;
  location?: string;
};

export type RegisterQtyProductInput = {
  id: string;
  name: string;
  categoryId: string;
  brand?: string;
  initialQuantity: number;
  unitCostDop: number;
  location?: string;
};

export type BaselineStatus = 'PRESENT' | 'MISSING' | 'NOT_APPLICABLE';

export type AssemblyBaselineEntry = {
  expectedComponentName: string;
  status: BaselineStatus;
  item?: RegisterItemInput;
  /** Required when a PRESENT component is itself an assembly. */
  baseline?: AssemblyBaselineEntry[];
};

export type RegisterAssemblyInput = {
  parent: RegisterItemInput;
  baseline: AssemblyBaselineEntry[];
};

export type RegisterAssemblyResult = {
  parent: Item;
  children: Item[];
  missingComponents: KnownMissingComponent[];
};

export type InventoryRegistrationResult = Item | QtyProduct | RegisterAssemblyResult;

/** Normal quantity receipt/entry (Seller and Administrator). */
export type ReceiveQtyStockInput = {
  qtyProductId: string;
  quantity: number;
  unitCostDop: number;
};

/** Audited Administrator-only quantity correction. Not a generic set-quantity. */
export type AdjustQtyStockInput = {
  qtyProductId: string;
  difference: number;
  reason: string;
};
