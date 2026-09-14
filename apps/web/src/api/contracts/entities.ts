export type Role = 'ADMINISTRATOR' | 'SELLER' | 'MECHANIC';

export type User = {
  id: string;
  name: string;
  username: string;
  /** Plain text only in local mock — never in production API. */
  password: string;
  /** Mock compatibility for the real API's mandatory first-login flow. */
  mustChangePassword?: boolean;
  role: Role;
  active: boolean;
  phone?: string;
  email?: string;
};

export type CommercialState = 'AVAILABLE' | 'SOLD';
export type PhysicalRelationship = 'INDEPENDENT' | 'INSTALLED';
export type ItemCondition = 'NEW' | 'USED' | 'REMANUFACTURED';

export type Item = {
  /**
   * Public inventory code (MOT-001). The mock uses this as the row key and
   * route param. Production stores a UUID primary key and this value as
   * `internalCode` — see FEATURES/02_INVENTORY.md.
   */
  id: string;
  name: string;
  categoryId: string;
  brand?: string;
  model?: string;
  partNumber?: string;
  serial?: string;
  condition: ItemCondition;
  acquisitionCostDop?: number;
  costProvenance?: string;
  location?: string;
  notes?: string;
  commercialState: CommercialState;
  physicalRelationship: PhysicalRelationship;
  parentId?: string;
  complete: boolean;
  noDesarmar?: boolean;
  reservedByDraftId?: string;
  photos: string[];
  attributes?: Record<string, string>;
};

export type KnownMissingComponent = {
  id: string;
  parentId: string;
  expectedComponentName: string;
  origin: 'MISSING_AT_RECEIPT' | 'REMOVED_AFTER_BASELINE';
  /** Present when origin is REMOVED_AFTER_BASELINE — identity is not deleted. */
  formerItemId?: string;
  workOrderId?: string;
};

/**
 * Catalog-grown expected slot on an already-registered unsold assembly.
 * PENDING_NA is provisional NOT_APPLICABLE (no Known Missing Component).
 * ALREADY_PRESENT means a current child already matches that expected category.
 */
export type PendingCatalogReview = {
  id: string;
  parentId: string;
  expectedComponentName: string;
  kind: 'PENDING_NA' | 'ALREADY_PRESENT';
  matchedChildId?: string;
};

export type QtyProduct = {
  id: string;
  name: string;
  categoryId: string;
  brand?: string;
  onHand: number;
  reserved: number;
  unitCostDop: number;
  location?: string;
};

export type CustomerContact = {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  title?: string;
  isPrimary?: boolean;
};

export type Customer = {
  id: string;
  name: string;
  rnc?: string;
  address?: string;
  notes?: string;
  isDefault?: boolean;
  contacts: CustomerContact[];
};

export type CategoryAttributeType = 'text' | 'number' | 'select';

/** Small Administrator-maintained field; not free-form item metadata. */
export type CategoryAttributeDefinition = {
  key: string;
  label: string;
  type: CategoryAttributeType;
  required?: boolean;
  options?: string[];
};

export type Category = {
  id: string;
  name: string;
  /** Short code used to mint item identities (`MOT` → `MOT-004`). Immutable after create. */
  codePrefix: string;
  isAssembly: boolean;
  expectedComponents?: string[];
  attributes?: CategoryAttributeDefinition[];
};

export type Service = {
  id: string;
  name: string;
  active: boolean;
};

export type InvoiceStatus = 'DRAFT' | 'COMPLETED' | 'CANCELLED';
export type PaymentState =
  'UNPAID' | 'PARTIALLY_PAID' | 'PENDING' | 'OVERDUE' | 'PAID' | 'PAID_LATE' | 'CANCELLED';
export type Currency = 'DOP' | 'USD';

export type LineType = 'ITEM' | 'QTY' | 'GENERIC' | 'EXTERNAL' | 'SERVICE' | 'DELIVERY';

/** Frozen copy of one node in an assembly sold as a unit (SALE-008). */
export type DeliveredAssemblyNode = {
  itemId: string;
  parentId?: string;
  name: string;
};

/** Immutable delivered-tree snapshot captured at confirmation (SALE-008). */
export type DeliveredAssembly = {
  rootItemId: string;
  nodes: DeliveredAssemblyNode[];
};

export type InvoiceLine = {
  id: string;
  type: LineType;
  description: string;
  notes?: string;
  itemId?: string;
  qtyProductId?: string;
  serviceId?: string;
  quantity: number;
  unitPrice: number;
  taxable: boolean;
  pricePending?: boolean;
  /** DOP cost copied at line creation so later inventory edits do not rewrite the sale. */
  acquisitionCostDop?: number;
  costProvenance?: 'ACTUAL' | 'ESTIMATED' | 'UNKNOWN';
};

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'CHECK';
export type PaymentKind = 'PAYMENT' | 'REFUND';

export type Payment = {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  createdAt: string;
  effectiveDate?: string;
  /** Omitted on seed receipts — treated as PAYMENT. */
  kind?: PaymentKind;
  actorId?: string;
  reference?: string;
  idempotencyKey?: string;
};

export type Invoice = {
  id: string;
  number?: string;
  status: InvoiceStatus;
  customerId: string;
  currency: Currency;
  fiscal: boolean;
  lines: InvoiceLine[];
  payments: Payment[];
  paymentState: PaymentState;
  createdAt: string;
  confirmedAt?: string;
  dueDate?: string;
  cancelledAt?: string;
  cancelReason?: string;
  profitabilityUsd?: number | null;
  profitabilityPendingFx?: boolean;
  /**
   * Administrator-entered gross profit in pesos when the system cannot calculate it
   * (unknown cost). Never treated as a calculated cost (COST-005).
   */
  manualGrossProfitDop?: number;
  manualGrossProfitAt?: string;
  /** Normalized DOP per 1 USD used for a completed USD profit result (COST-003). */
  fxRateDopPerUsd?: number;
  fxSource?: string;
  fxRateAt?: string;
  fxCalculatedAt?: string;
  /** Frozen at confirmation so later customer edits cannot rewrite issued documents (CUST-003). */
  customerSnapshot?: {
    name: string;
    rnc?: string;
  };
  /**
   * SALE-008: exact hierarchy delivered for each assembly line, frozen at confirm.
   * Later live parentId/name edits and cancellation must not rewrite this copy.
   */
  deliveredAssemblies?: DeliveredAssembly[];
};

export type WorkOrderType = 'DISMANTLING' | 'INSTALLATION';
export type WorkOrderStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type WorkOrder = {
  id: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  pieceId: string;
  sourceParentId?: string;
  destinationParentId?: string;
  assignedMechanicId?: string;
  /** Current commercial invoice (latest confirm). */
  invoiceId?: string;
  /** Additive invoice history so reuse does not erase prior commercial links. */
  linkedInvoiceIds?: string[];
  notes?: string;
  beforePhotos: string[];
  afterPhotos: string[];
  createdAt: string;
  cancelReason?: string;
  cancelledAt?: string;
};

export type AppEvent = {
  id: string;
  type: string;
  description: string;
  actorId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

/** Read model for timelines — actor name stays even if the account is later deactivated (HIST-002). */
export type HistoryEventView = {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  actorName?: string;
};

/** In-memory application state with sessionStorage backup in the mock until HTTP repositories. */
export type AppState = {
  users: User[];
  items: Item[];
  knownMissing: KnownMissingComponent[];
  pendingCatalogReviews: PendingCatalogReview[];
  qtyProducts: QtyProduct[];
  customers: Customer[];
  categories: Category[];
  services: Service[];
  invoices: Invoice[];
  workOrders: WorkOrder[];
  events: AppEvent[];
  fxAvailable: boolean;
  fxRateDopPerUsd: number;
  facSeq: number;
  /** Next unused number per category id for individually tracked item codes. */
  itemCodeSeq: Record<string, number>;
};

export type Session = {
  userId: string;
  createdAt: string;
};

export type MechanicWorkOrderActions = {
  canTake: boolean;
  canAddEvidence: boolean;
  canComplete: boolean;
};

/** Mechanic-facing projection — no commercial fields (WM10 / WO-003). */
export type MechanicWorkOrderView = {
  id: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  pieceId: string;
  pieceName: string;
  sourceParentId?: string;
  sourceParentName?: string;
  destinationParentId?: string;
  destinationParentName?: string;
  assignedMechanicId?: string;
  assignedMechanicName?: string;
  effectiveLocation?: string;
  notes?: string;
  beforePhotos: string[];
  afterPhotos: string[];
  href: string;
  actions: MechanicWorkOrderActions;
};
