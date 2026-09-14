import type {
  AppEvent,
  Currency,
  DeliveredAssembly,
  InvoiceStatus,
  LineType,
  PaymentKind,
  PaymentMethod,
  PaymentState,
  WorkOrderStatus,
  WorkOrderType,
} from './entities';
import type { HierarchyNode } from './inventory';

export type SalesListTab = 'ALL' | 'DRAFT' | 'COMPLETED' | 'CANCELLED';

export type SalesListRow = {
  id: string;
  number: string;
  status: InvoiceStatus;
  paymentState: PaymentState;
  customerId: string;
  customerName: string;
  currency: Currency;
  fiscal: boolean;
  total: number;
  balance: number;
  createdAt: string;
  confirmedAt?: string;
  dueDate?: string;
  href: string;
};

export type CustomerOutstandingRow = {
  customerId: string;
  customerName: string;
  currency: Currency;
  invoiceCount: number;
  invoiced: number;
  paid: number;
  balance: number;
};

export type ReceivablesSnapshot = {
  invoices: SalesListRow[];
  customers: CustomerOutstandingRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type InvoiceLineView = {
  id: string;
  type: LineType;
  description: string;
  notes?: string;
  quantity: number;
  unitPrice: number;
  taxable: boolean;
  gross: number;
  base: number;
  itbis: number;
};

export type PaymentView = {
  id: string;
  kind: PaymentKind;
  amount: number;
  method: PaymentMethod;
  createdAt: string;
  effectiveDate?: string;
  recordedAt?: string;
  reference?: string;
  actorName?: string;
};

export type LinkedWorkOrderView = {
  id: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  pieceId: string;
  pieceName: string;
};

export type InvoiceHistoryEntry = {
  id: string;
  type: AppEvent['type'];
  description: string;
  createdAt: string;
  actorName?: string;
};

export type ProfitabilitySource = 'CALCULATED' | 'MANUAL';

export type InvoiceProfitabilityView = {
  /** Reporting currency is always pesos; USD sales are converted with the stored FX rate. */
  currency: 'DOP';
  profit: number | null;
  pendingFx: boolean;
  /** Present when profit is a number: system math vs administrator judgment. */
  source?: ProfitabilitySource;
  reason?: string;
  rateDopPerUsd?: number;
  rateSource?: string;
};

export type InvoiceDocumentView = { status: 'READY' } | { status: 'FAILED'; errorId: string };

export type InvoicePdfDownload = {
  blob: Blob;
  filename: string;
};

export type InvoiceDetailActions = {
  canPay: boolean;
  canCancel: boolean;
  canCorrectCurrency: boolean;
  canViewPdf: boolean;
  canRegeneratePdf: boolean;
};

export type InvoiceDetailView = {
  id: string;
  number?: string;
  status: InvoiceStatus;
  paymentState: PaymentState;
  customerId: string;
  customerName: string;
  customerRnc?: string;
  currency: Currency;
  fiscal: boolean;
  lines: InvoiceLineView[];
  payments: PaymentView[];
  total: number;
  paid: number;
  refunded: number;
  balance: number;
  createdAt: string;
  confirmedAt?: string;
  dueDate?: string;
  sellerName?: string;
  cancelledAt?: string;
  cancelReason?: string;
  cancelledByName?: string;
  linkedWorkOrders: LinkedWorkOrderView[];
  history: InvoiceHistoryEntry[];
  profitability?: InvoiceProfitabilityView;
  document?: InvoiceDocumentView;
  actions: InvoiceDetailActions;
  /** Copied as-is from the invoice; omitted when no assembly was sold. */
  deliveredAssemblies?: DeliveredAssembly[];
};

export type AddPaymentInput = {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  effectiveDate: string;
  reference?: string;
  idempotencyKey?: string;
};

/** Optional cash/partial receipt recorded atomically with SALE-005 confirmation. */
export type ConfirmInvoicePayment = {
  amount: number;
  method: PaymentMethod;
  reference?: string;
  idempotencyKey?: string;
};

export type InProgressCancelDecision = 'STOP' | 'CONTINUE';

export type CancelInvoiceInput = {
  invoiceId: string;
  reason: string;
  refundAmount?: number;
  refundMethod?: PaymentMethod;
  refundReference?: string;
  idempotencyKey?: string;
  inProgressDecision?: InProgressCancelDecision;
};

export type CorrectCurrencyInput = {
  invoiceId: string;
  currency: Currency;
  reason: string;
};

export type PosDraftTotals = {
  lineCount: number;
  gross: number;
  itbis: number;
  taxableBase: number;
};

export type CostProvenance = 'ACTUAL' | 'ESTIMATED' | 'UNKNOWN';

export type PosLineView = {
  id: string;
  type: LineType;
  description: string;
  notes?: string;
  quantity: number;
  unitPrice: number;
  taxable: boolean;
  pricePending: boolean;
  gross: number;
  itbis: number;
  base: number;
  itemId?: string;
  qtyProductId?: string;
  serviceId?: string;
  acquisitionCostDop?: number;
  costProvenance: CostProvenance;
  installed?: boolean;
  parentName?: string;
  isAssembly?: boolean;
  tree?: HierarchyNode;
  activeWorkMessage?: string;
};

export type PosDraftView = {
  id: string;
  status: InvoiceStatus;
  number?: string;
  customerId: string;
  customerName: string;
  customerRnc?: string;
  customerIsDefault: boolean;
  currency: Currency;
  fiscal: boolean;
  lines: PosLineView[];
  totals: PosDraftTotals;
  customers: Array<{ id: string; name: string; rnc?: string; isDefault?: boolean }>;
  services: Array<{ id: string; name: string }>;
  qtyProducts: Array<{ id: string; name: string; available: number }>;
  items: Array<{ id: string; name: string; reservedByDraftId?: string }>;
  blockers: string[];
  createdWorkOrderIds: string[];
};

export type CreateDraftResult = {
  draftId: string;
};

export type AddDraftLineInput = {
  draftId: string;
  type: LineType;
  itemId?: string;
  qtyProductId?: string;
  serviceId?: string;
  description?: string;
  notes?: string;
  quantity?: number;
  unitPrice?: number;
  acquisitionCostDop?: number;
  costProvenance?: CostProvenance;
};

export type RemoveDraftLineInput = {
  draftId: string;
  lineId: string;
};

export type SetDraftLinePriceInput = {
  draftId: string;
  lineId: string;
  unitPrice: number;
  quantity?: number;
  /** Free-form types only. */
  description?: string;
  notes?: string | null;
  /** GENERIC / EXTERNAL only. */
  acquisitionCostDop?: number | null;
  costProvenance?: CostProvenance;
};

export type SetDraftLineQuantityInput = {
  draftId: string;
  lineId: string;
  quantity: number;
};

export type SetDraftMetaInput = {
  draftId: string;
  customerId?: string;
  currency?: Currency;
  fiscal?: boolean;
};
