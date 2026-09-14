import type {
  AuthRepository,
  CategoryRepository,
  CustomerRepository,
  DashboardRepository,
  EventRepository,
  InventoryRepository,
  ProfitabilityRepository,
  RecoveryRepository,
  SalesRepository,
  ServiceRepository,
  UserRepository,
  WorkOrderRepository,
} from '../contracts/repositories';
import type { ConfirmInvoicePayment } from '../contracts/sales';
import type { UpdateOwnProfileInput } from '../contracts/profile';
import {
  loginWithHttp,
  logoutWithHttp,
  getSessionWithHttp,
  getCurrentUserWithHttp,
  updateOwnProfileWithHttp,
  requestRecoveryWithHttp,
} from '../client/auth-api';
import {
  listServicesWithHttp,
  saveServiceWithHttp,
} from '../client/catalogs-api';
import {
  getCustomerByIdWithHttp,
  listCustomersWithHttp,
  saveCustomerWithHttp,
  searchCustomersWithHttp,
} from '../client/customers-api';
import {
  addDraftLineWithHttp,
  addPaymentWithHttp,
  cancelInvoiceWithHttp,
  confirmInvoiceWithHttp,
  correctCurrencyWithHttp,
  createDraftWithHttp,
  discardDraftWithHttp,
  getDraftWithHttp,
  getInvoiceWithHttp,
  getInvoicePdfWithHttp,
  listInvoicesWithHttp,
  listReceivablesWithHttp,
  regenerateInvoicePdfWithHttp,
  removeDraftLineWithHttp,
  setDraftLinePriceWithHttp,
  setDraftLineQuantityWithHttp,
  setDraftMetaWithHttp,
} from '../client/sales-api';
import {
  listRecoveryRequestsWithHttp,
  listUsersWithHttp,
  resolveRecoveryWithHttp,
  saveUserWithHttp,
} from '../client/users-api';
import {
  getProfitabilitySnapshotWithHttp,
  recordManualGrossProfitWithHttp,
  retryUsdProfitabilityWithHttp,
} from '../client/profitability-api';
import { httpNotImplemented } from '../client/http-not-implemented';

/**
 * Access/profile (R1), customers (M19), services (M20), POS drafts (M21),
 * confirmation (M22), PDF (M23) and profitability (M24) use the real API.
 * Dashboard KPIs, recovery and inventory remain stubbed.
 */
export class HttpAuthRepository implements AuthRepository {
  async login(username: string, password: string) {
    return loginWithHttp({ username, password });
  }

  async logout() {
    return logoutWithHttp();
  }

  async getSession() {
    return getSessionWithHttp();
  }

  async getCurrentUser() {
    return getCurrentUserWithHttp();
  }

  async updateOwnProfile(input: UpdateOwnProfileInput) {
    return updateOwnProfileWithHttp(input);
  }

  async requestRecovery(username: string) {
    return requestRecoveryWithHttp(username);
  }
}

export class HttpUserRepository implements UserRepository {
  async list(page = 1) {
    return listUsersWithHttp(page);
  }

  async save(input: Parameters<UserRepository['save']>[0]) {
    return saveUserWithHttp(input);
  }

  async listRecoveryRequests() {
    return listRecoveryRequestsWithHttp();
  }

  async resolveRecovery(input: Parameters<UserRepository['resolveRecovery']>[0]) {
    return resolveRecoveryWithHttp(input);
  }
}

export class HttpInventoryRepository implements InventoryRepository {
  async listItems() {
    return httpNotImplemented('HttpInventoryRepository', 'listItems');
  }

  async getItem() {
    return httpNotImplemented('HttpInventoryRepository', 'getItem');
  }

  async listQtyProducts() {
    return httpNotImplemented('HttpInventoryRepository', 'listQtyProducts');
  }

  async getQtyProduct() {
    return httpNotImplemented('HttpInventoryRepository', 'getQtyProduct');
  }

  async listCatalog() {
    return httpNotImplemented('HttpInventoryRepository', 'listCatalog');
  }

  async getDetail() {
    return httpNotImplemented('HttpInventoryRepository', 'getDetail');
  }

  async addToDraft() {
    return httpNotImplemented('HttpInventoryRepository', 'addToDraft');
  }

  async setNoDesarmar() {
    return httpNotImplemented('HttpInventoryRepository', 'setNoDesarmar');
  }

  async correctAcquisitionCost() {
    return httpNotImplemented('HttpInventoryRepository', 'correctAcquisitionCost');
  }

  async correctReceiptBaseline() {
    return httpNotImplemented('HttpInventoryRepository', 'correctReceiptBaseline');
  }

  async resolveCatalogReview() {
    return httpNotImplemented('HttpInventoryRepository', 'resolveCatalogReview');
  }

  async createManualWorkOrder() {
    return httpNotImplemented('HttpInventoryRepository', 'createManualWorkOrder');
  }

  async registerItem() {
    return httpNotImplemented('HttpInventoryRepository', 'registerItem');
  }

  async updateItemDetails() {
    return httpNotImplemented('HttpInventoryRepository', 'updateItemDetails');
  }

  async registerAssembly() {
    return httpNotImplemented('HttpInventoryRepository', 'registerAssembly');
  }

  async registerQtyProduct() {
    return httpNotImplemented('HttpInventoryRepository', 'registerQtyProduct');
  }

  async updateQtyProductDetails() {
    return httpNotImplemented('HttpInventoryRepository', 'updateQtyProductDetails');
  }

  async receiveQtyStock() {
    return httpNotImplemented('HttpInventoryRepository', 'receiveQtyStock');
  }

  async adjustQtyStock() {
    return httpNotImplemented('HttpInventoryRepository', 'adjustQtyStock');
  }
}

export class HttpCustomerRepository implements CustomerRepository {
  async list() {
    return listCustomersWithHttp();
  }

  async search(query: string, page = 1) {
    return searchCustomersWithHttp(query, page);
  }

  async getById(id: string) {
    return getCustomerByIdWithHttp(id);
  }

  async save(input: Parameters<CustomerRepository['save']>[0]) {
    return saveCustomerWithHttp(input);
  }
}

export class HttpSalesRepository implements SalesRepository {
  async listInvoices(
    tab?: Parameters<SalesRepository['listInvoices']>[0],
    page = 1,
    q?: string,
  ) {
    return listInvoicesWithHttp(tab, page, q);
  }

  async listReceivables(page = 1) {
    return listReceivablesWithHttp(page);
  }

  async getInvoice(id: string) {
    return getInvoiceWithHttp(id);
  }

  async getInvoicePdf(id: string) {
    return getInvoicePdfWithHttp(id);
  }

  async regenerateInvoicePdf(id: string) {
    return regenerateInvoicePdfWithHttp(id);
  }

  async addPayment(input: Parameters<SalesRepository['addPayment']>[0]) {
    return addPaymentWithHttp(input);
  }

  async cancelInvoice(input: Parameters<SalesRepository['cancelInvoice']>[0]) {
    return cancelInvoiceWithHttp(input);
  }

  async correctCurrency(input: Parameters<SalesRepository['correctCurrency']>[0]) {
    return correctCurrencyWithHttp(input);
  }

  async createDraft() {
    return createDraftWithHttp();
  }

  async getDraft(id: string) {
    return getDraftWithHttp(id);
  }

  async addLine(input: Parameters<SalesRepository['addLine']>[0]) {
    return addDraftLineWithHttp(input);
  }

  async removeLine(input: Parameters<SalesRepository['removeLine']>[0]) {
    return removeDraftLineWithHttp(input);
  }

  async setLinePrice(input: Parameters<SalesRepository['setLinePrice']>[0]) {
    return setDraftLinePriceWithHttp(input);
  }

  async setLineQuantity(input: Parameters<SalesRepository['setLineQuantity']>[0]) {
    return setDraftLineQuantityWithHttp(input);
  }

  async setDraftMeta(input: Parameters<SalesRepository['setDraftMeta']>[0]) {
    return setDraftMetaWithHttp(input);
  }

  async confirmInvoice(draftId: string, payment?: ConfirmInvoicePayment) {
    return confirmInvoiceWithHttp(draftId, payment);
  }

  async discardDraft(draftId: string) {
    return discardDraftWithHttp(draftId);
  }
}

export class HttpWorkOrderRepository implements WorkOrderRepository {
  async list() {
    return httpNotImplemented('HttpWorkOrderRepository', 'list');
  }

  async getById() {
    return httpNotImplemented('HttpWorkOrderRepository', 'getById');
  }

  async listForMechanic() {
    return httpNotImplemented('HttpWorkOrderRepository', 'listForMechanic');
  }

  async getForMechanic() {
    return httpNotImplemented('HttpWorkOrderRepository', 'getForMechanic');
  }

  async getCreateOptions() {
    return httpNotImplemented('HttpWorkOrderRepository', 'getCreateOptions');
  }

  async createManual() {
    return httpNotImplemented('HttpWorkOrderRepository', 'createManual');
  }

  async reassign() {
    return httpNotImplemented('HttpWorkOrderRepository', 'reassign');
  }

  async cancel() {
    return httpNotImplemented('HttpWorkOrderRepository', 'cancel');
  }

  async takeOrder() {
    return httpNotImplemented('HttpWorkOrderRepository', 'takeOrder');
  }

  async addPhoto() {
    return httpNotImplemented('HttpWorkOrderRepository', 'addPhoto');
  }

  async completeDesarme() {
    return httpNotImplemented('HttpWorkOrderRepository', 'completeDesarme');
  }

  async completeInstalacion() {
    return httpNotImplemented('HttpWorkOrderRepository', 'completeInstalacion');
  }
}

export class HttpCategoryRepository implements CategoryRepository {
  async list() {
    return httpNotImplemented('HttpCategoryRepository', 'list');
  }

  async save() {
    return httpNotImplemented('HttpCategoryRepository', 'save');
  }
}

export class HttpServiceRepository implements ServiceRepository {
  async list() {
    return listServicesWithHttp();
  }

  async save(input: Parameters<ServiceRepository['save']>[0]) {
    return saveServiceWithHttp(input);
  }
}

export class HttpEventRepository implements EventRepository {
  async list() {
    return httpNotImplemented('HttpEventRepository', 'list');
  }
}

export class HttpDashboardRepository implements DashboardRepository {
  async getSnapshot() {
    return httpNotImplemented('HttpDashboardRepository', 'getSnapshot');
  }
}

export class HttpProfitabilityRepository implements ProfitabilityRepository {
  async getSnapshot() {
    return getProfitabilitySnapshotWithHttp();
  }

  async setFxAvailable(_input: Parameters<ProfitabilityRepository['setFxAvailable']>[0]) {
    return httpNotImplemented('HttpProfitabilityRepository', 'setFxAvailable');
  }

  async retryUsd(input: Parameters<ProfitabilityRepository['retryUsd']>[0]) {
    return retryUsdProfitabilityWithHttp(input);
  }

  async recordManualGrossProfit(
    input: Parameters<ProfitabilityRepository['recordManualGrossProfit']>[0],
  ) {
    return recordManualGrossProfitWithHttp(input);
  }
}

export class HttpRecoveryRepository implements RecoveryRepository {
  async getSnapshot() {
    return httpNotImplemented('HttpRecoveryRepository', 'getSnapshot');
  }

  async releaseReservation() {
    return httpNotImplemented('HttpRecoveryRepository', 'releaseReservation');
  }

  async retryUsdProfitability() {
    return httpNotImplemented('HttpRecoveryRepository', 'retryUsdProfitability');
  }
}

export const httpAuthRepository = new HttpAuthRepository();
export const httpUserRepository = new HttpUserRepository();
export const httpInventoryRepository = new HttpInventoryRepository();
export const httpCustomerRepository = new HttpCustomerRepository();
export const httpSalesRepository = new HttpSalesRepository();
export const httpWorkOrderRepository = new HttpWorkOrderRepository();
export const httpCategoryRepository = new HttpCategoryRepository();
export const httpServiceRepository = new HttpServiceRepository();
export const httpEventRepository = new HttpEventRepository();
export const httpDashboardRepository = new HttpDashboardRepository();
export const httpProfitabilityRepository = new HttpProfitabilityRepository();
export const httpRecoveryRepository = new HttpRecoveryRepository();
