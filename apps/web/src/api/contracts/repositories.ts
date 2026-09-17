import type { Result } from '../../shared/auth/types';
import type { ListPage } from './pagination';
import type { AuthSession, PublicUser } from './auth';
import type { SaveCategoryInput, SaveServiceInput } from './catalogs';
import type { CustomerListRow, SaveCustomerInput } from './customers';
import type { UpdateOwnProfileInput, UpdateOwnProfileResult } from './profile';
import type {
  ManagedUser,
  PasswordRecoveryRequest,
  ResolveRecoveryInput,
  ResolveRecoveryResult,
  SaveUserInput,
  SaveUserResult,
} from './users';
import type { DashboardSnapshot } from './dashboard';
import type {
  AddToDraftInput,
  AddToDraftResult,
  BaselineCorrectionInput,
  CostCorrectionInput,
  ResolveCatalogReviewInput,
  InventoryDetail,
  InventoryListFilters,
  InventoryListRow,
  ManualWorkOrderInput,
  NoDesarmarInput,
  RegisterAssemblyInput,
  RegisterAssemblyResult,
  RegisterItemInput,
  RegisterQtyProductInput,
  ReceiveQtyStockInput,
  AdjustQtyStockInput,
  UpdateItemDetailsInput,
  UpdateQtyProductDetailsInput,
} from './inventory';
import type {
  ProfitabilitySnapshot,
  RecordManualGrossProfitInput,
  RetryUsdProfitabilityInput,
  SetFxAvailableInput,
} from './profitability';
import type {
  ReleaseReservationInput,
  RecoverySnapshot,
  ReleaseReservationResult,
} from './recovery';
import type {
  AddDraftLineInput,
  AddPaymentInput,
  CancelInvoiceInput,
  ConfirmInvoicePayment,
  CorrectCurrencyInput,
  CreateDraftResult,
  InvoiceDetailView,
  InvoicePdfDownload,
  QuotePdfDownload,
  AccountStatementPdfDownload,
  PosDraftView,
  ReceivablesSnapshot,
  ReceivablesFilters,
  RemoveDraftLineInput,
  SalesListRow,
  SalesListFilters,
  SalesListTab,
  SetDraftLinePriceInput,
  SetDraftLineQuantityInput,
  SetDraftMetaInput,
} from './sales';
import type {
  AddWorkOrderPhotoInput,
  CancelWorkOrderInput,
  CompleteWorkOrderInput,
  CreateManualWorkOrderInput,
  ReassignWorkOrderInput,
  WorkOrderCreateOptions,
  WorkOrderDetailView,
  WorkOrderListRow,
  WorkOrderListTab,
} from './work-orders';
import type {
  AppEvent,
  Category,
  Customer,
  Item,
  MechanicWorkOrderView,
  QtyProduct,
  Service,
  WorkOrder,
} from './entities';

export type AuthRepository = {
  login(username: string, password: string): Promise<Result<AuthSession>>;
  logout(): Promise<Result<void>>;
  getSession(): Promise<Result<AuthSession | null>>;
  getCurrentUser(): Promise<Result<PublicUser | null>>;
  updateOwnProfile(input: UpdateOwnProfileInput): Promise<Result<UpdateOwnProfileResult>>;
  requestRecovery(username: string): Promise<Result<void>>;
};

export type UserRepository = {
  list(page?: number): Promise<Result<ListPage<ManagedUser>>>;
  save(input: SaveUserInput): Promise<Result<SaveUserResult>>;
  listRecoveryRequests(): Promise<Result<PasswordRecoveryRequest[]>>;
  resolveRecovery(input: ResolveRecoveryInput): Promise<Result<ResolveRecoveryResult>>;
};

export type InventoryRepository = {
  listItems(): Promise<Result<Item[]>>;
  getItem(id: string): Promise<Result<Item>>;
  listQtyProducts(): Promise<Result<QtyProduct[]>>;
  getQtyProduct(id: string): Promise<Result<QtyProduct>>;
  listCatalog(filters?: InventoryListFilters): Promise<Result<InventoryListRow[]>>;
  getDetail(id: string): Promise<Result<InventoryDetail>>;
  addToDraft(input: AddToDraftInput): Promise<Result<AddToDraftResult>>;
  setNoDesarmar(input: NoDesarmarInput): Promise<Result<Item>>;
  correctAcquisitionCost(input: CostCorrectionInput): Promise<Result<Item>>;
  correctReceiptBaseline(input: BaselineCorrectionInput): Promise<Result<Item>>;
  resolveCatalogReview(input: ResolveCatalogReviewInput): Promise<Result<Item>>;
  createManualWorkOrder(input: ManualWorkOrderInput): Promise<Result<WorkOrder>>;
  registerItem(input: RegisterItemInput): Promise<Result<Item>>;
  updateItemDetails(input: UpdateItemDetailsInput): Promise<Result<Item>>;
  registerAssembly(input: RegisterAssemblyInput): Promise<Result<RegisterAssemblyResult>>;
  registerQtyProduct(input: RegisterQtyProductInput): Promise<Result<QtyProduct>>;
  updateQtyProductDetails(input: UpdateQtyProductDetailsInput): Promise<Result<QtyProduct>>;
  receiveQtyStock(input: ReceiveQtyStockInput): Promise<Result<QtyProduct>>;
  adjustQtyStock(input: AdjustQtyStockInput): Promise<Result<QtyProduct>>;
};

export type CustomerRepository = {
  /** Full directory for POS lookups. The customers page uses `search` with paging. */
  list(): Promise<Result<CustomerListRow[]>>;
  search(
    query: string,
    page?: number,
    customerType?: 'CASH' | 'CREDIT',
  ): Promise<Result<ListPage<CustomerListRow>>>;
  getById(id: string): Promise<Result<Customer>>;
  save(input: SaveCustomerInput): Promise<Result<Customer>>;
};

export type SalesRepository = {
  listInvoices(
    tab?: SalesListTab,
    page?: number,
    q?: string,
    filters?: SalesListFilters,
  ): Promise<Result<ListPage<SalesListRow>>>;
  listReceivables(
    page?: number,
    filters?: ReceivablesFilters,
  ): Promise<Result<ReceivablesSnapshot>>;
  getInvoice(id: string): Promise<Result<InvoiceDetailView>>;
  getInvoicePdf(id: string): Promise<Result<InvoicePdfDownload>>;
  getQuotePdf(id: string): Promise<Result<QuotePdfDownload>>;
  getAccountStatementPdf(customerId: string): Promise<Result<AccountStatementPdfDownload>>;
  regenerateInvoicePdf(id: string): Promise<Result<InvoiceDetailView>>;
  addPayment(input: AddPaymentInput): Promise<Result<InvoiceDetailView>>;
  cancelInvoice(input: CancelInvoiceInput): Promise<Result<InvoiceDetailView>>;
  correctCurrency(input: CorrectCurrencyInput): Promise<Result<InvoiceDetailView>>;
  createDraft(): Promise<Result<CreateDraftResult>>;
  createQuote(): Promise<Result<CreateDraftResult>>;
  getDraft(id: string): Promise<Result<PosDraftView>>;
  addLine(input: AddDraftLineInput): Promise<Result<PosDraftView>>;
  removeLine(input: RemoveDraftLineInput): Promise<Result<PosDraftView>>;
  setLinePrice(input: SetDraftLinePriceInput): Promise<Result<PosDraftView>>;
  setLineQuantity(input: SetDraftLineQuantityInput): Promise<Result<PosDraftView>>;
  setDraftMeta(input: SetDraftMetaInput): Promise<Result<PosDraftView>>;
  confirmInvoice(draftId: string, payment?: ConfirmInvoicePayment): Promise<Result<PosDraftView>>;
  issueQuote(draftId: string): Promise<Result<PosDraftView>>;
  duplicateQuote(quoteId: string): Promise<Result<CreateDraftResult>>;
  convertQuote(quoteId: string, payment?: ConfirmInvoicePayment): Promise<Result<PosDraftView>>;
  discardDraft(draftId: string): Promise<Result<void>>;
};

export type WorkOrderRepository = {
  list(tab?: WorkOrderListTab): Promise<Result<WorkOrderListRow[]>>;
  getById(id: string): Promise<Result<WorkOrderDetailView>>;
  listForMechanic(): Promise<Result<MechanicWorkOrderView[]>>;
  getForMechanic(id: string): Promise<Result<MechanicWorkOrderView>>;
  getCreateOptions(): Promise<Result<WorkOrderCreateOptions>>;
  createManual(input: CreateManualWorkOrderInput): Promise<Result<WorkOrderDetailView>>;
  reassign(input: ReassignWorkOrderInput): Promise<Result<WorkOrderDetailView>>;
  cancel(input: CancelWorkOrderInput): Promise<Result<WorkOrderDetailView>>;
  takeOrder(workOrderId: string): Promise<Result<MechanicWorkOrderView>>;
  addPhoto(input: AddWorkOrderPhotoInput): Promise<Result<MechanicWorkOrderView>>;
  completeDesarme(input: CompleteWorkOrderInput): Promise<Result<MechanicWorkOrderView>>;
  completeInstalacion(input: CompleteWorkOrderInput): Promise<Result<MechanicWorkOrderView>>;
};

export type CategoryRepository = {
  list(): Promise<Result<Category[]>>;
  save(input: SaveCategoryInput): Promise<Result<Category>>;
};

export type ServiceRepository = {
  list(): Promise<Result<Service[]>>;
  save(input: SaveServiceInput): Promise<Result<Service>>;
};

export type EventRepository = {
  list(): Promise<Result<AppEvent[]>>;
};

export type DashboardRepository = {
  getSnapshot(): Promise<Result<DashboardSnapshot>>;
};

export type ProfitabilityRepository = {
  getSnapshot(): Promise<Result<ProfitabilitySnapshot>>;
  setFxAvailable(input: SetFxAvailableInput): Promise<Result<ProfitabilitySnapshot>>;
  retryUsd(input: RetryUsdProfitabilityInput): Promise<Result<ProfitabilitySnapshot>>;
  recordManualGrossProfit(
    input: RecordManualGrossProfitInput,
  ): Promise<Result<ProfitabilitySnapshot>>;
};

export type RecoveryRepository = {
  getSnapshot(): Promise<Result<RecoverySnapshot>>;
  releaseReservation(input: ReleaseReservationInput): Promise<Result<ReleaseReservationResult>>;
  retryUsdProfitability(input: RetryUsdProfitabilityInput): Promise<Result<RecoverySnapshot>>;
};
