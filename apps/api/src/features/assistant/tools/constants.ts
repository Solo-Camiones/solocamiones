/** Hard cap shared by list-style assistant tools (AI-003 / M4). */
export const ASSISTANT_TOOL_MAX_ROWS = 20;

/** Profitability period upper bound in calendar days (inclusive span). */
export const ASSISTANT_PROFITABILITY_MAX_RANGE_DAYS = 366;

export const ASSISTANT_APP_PATHS = {
  customers: '/customers',
  salesDocument: (id: string) => `/sales/${id}`,
  receivables: '/receivables',
  profitability: '/profitability',
} as const;

export function assistantToolSourceKey(toolName: string): string {
  return `tool:${toolName}`;
}

export const ASSISTANT_TOOL_NAMES = [
  'searchCustomers',
  'getCustomerCommercialSummary',
  'searchSalesDocuments',
  'getSalesDocumentDetail',
  'getReceivablesSummary',
  'getProfitabilitySummary',
] as const;

export type AssistantToolName = (typeof ASSISTANT_TOOL_NAMES)[number];
