/**
 * Documented HTTP map for the mock → API swap.
 * Paths document each repository's real API integration as its backend milestone lands.
 */
export const REPOSITORY_ENDPOINT_MAP = {
  AuthRepository: {
    login: 'POST /api/auth/login',
    logout: 'POST /api/auth/logout',
    getSession: 'GET /api/auth/session',
    getCurrentUser: 'GET /api/auth/me',
    updateOwnProfile: 'PATCH /api/auth/me',
    requestRecovery: 'POST /api/auth/recovery-requests',
  },
  UserRepository: {
    list: 'GET /api/admin/users',
    create: 'POST /api/admin/users',
    update: 'PATCH /api/admin/users/:id',
    listRecoveryRequests: 'GET /api/admin/users/recovery-requests',
    resolveRecovery: 'POST /api/admin/users/recovery-requests/:id/resolve',
  },
  DashboardRepository: {
    getSnapshot: 'GET /api/dashboard',
  },
  InventoryRepository: {
    listCatalog: 'GET /api/inventory',
    getDetail: 'GET /api/inventory/:id',
    addToDraft: 'POST /api/inventory/:id/draft',
    registerItem: 'POST /api/inventory/items',
    updateItemDetails: 'PATCH /api/inventory/items/:id',
    registerAssembly: 'POST /api/inventory/assemblies',
    registerQtyProduct: 'POST /api/inventory/qty-products',
    updateQtyProductDetails: 'PATCH /api/inventory/qty-products/:id',
  },
  CustomerRepository: {
    list: 'GET /api/customers',
    search: 'GET /api/customers?q=',
    getById: 'GET /api/customers/:id',
    create: 'POST /api/customers',
    update: 'PATCH /api/customers/:id',
  },
  SalesRepository: {
    listInvoices: 'GET /api/sales?page=&pageSize=',
    listReceivables: 'GET /api/sales/receivables',
    getInvoice: 'GET /api/sales/:id',
    createDraft: 'POST /api/sales',
    getDraft: 'GET /api/sales/:id',
    setDraftMeta: 'PATCH /api/sales/:id',
    discardDraft: 'DELETE /api/sales/:id',
    addLine: 'POST /api/sales/:id/lines',
    setLinePrice: 'PATCH /api/sales/:id/lines/:lineId',
    setLineQuantity: 'PATCH /api/sales/:id/lines/:lineId',
    removeLine: 'DELETE /api/sales/:id/lines/:lineId',
    confirmInvoice: 'POST /api/sales/:id/confirm',
    getInvoicePdf: 'GET /api/sales/:id/pdf',
    regenerateInvoicePdf: 'POST /api/sales/:id/pdf/regenerate',
    addPayment: 'POST /api/sales/:id/payments',
    cancelInvoice: 'POST /api/sales/:id/cancel',
  },
  WorkOrderRepository: {
    list: 'GET /api/work-orders',
    getById: 'GET /api/work-orders/:id',
    takeOrder: 'POST /api/work-orders/:id/take',
    completeDesarme: 'POST /api/work-orders/:id/complete-dismantling',
  },
  CategoryRepository: {
    list: 'GET /api/catalogs/categories',
    save: 'PUT /api/catalogs/categories/:id',
  },
  ServiceRepository: {
    list: 'GET /api/catalogs/services',
    save: 'POST /api/catalogs/services | PATCH /api/catalogs/services/:id',
  },
  ProfitabilityRepository: {
    getSnapshot:
      'GET /api/sales?status=COMPLETED and GET /api/sales?status=CANCELLED (composed snapshot; no GET /api/profitability)',
    setFxAvailable: 'POST /api/profitability/fx (demo only — not a production endpoint)',
    retryUsd: 'POST /api/profitability/:invoiceId/retry',
    recordManualGrossProfit: 'POST /api/profitability/:invoiceId/manual-gross-profit',
  },
  RecoveryRepository: {
    getSnapshot: 'GET /api/recovery',
    releaseReservation: 'POST /api/recovery/reservations/:draftId/release',
    retryUsdProfitability: 'POST /api/recovery/profitability/:invoiceId/retry',
  },
} as const;
