/**
 * KPI / list deep-links used by the dashboard (UX 2.0 M5).
 * Destination screens own applying these query params; do not add new routes.
 */
export const OPERATIONAL_HREFS = {
  inventoryAvailable: '/inventory?available=1',
  inventoryIncompleteAssemblies: '/inventory?assemblies=1&incomplete=1',
  inventoryPendingCatalog: '/inventory?pendingCatalog=1',
  workOrdersPendingDismantling: '/work-orders?type=DISMANTLING&status=PENDING',
  workOrdersInProgress: '/work-orders?status=IN_PROGRESS',
  salesToday: '/sales?today=1',
  salesOutstanding: '/receivables',
  salesPayments: '/sales?payments=1',
  salesDrafts: '/sales?tab=DRAFT',
  profitability: '/profitability',
  profitabilityPendingFx: '/profitability?pendingFx=1',
} as const;
