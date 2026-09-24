import { CustomersAssistantQueryService } from '../../customers/assistant-query-service.js';
import { ReceivablesAssistantQueryService } from '../../payments/assistant-query-service.js';
import { ProfitabilityAssistantQueryService } from '../../profitability/assistant-query-service.js';
import { SalesAssistantQueryService } from '../../sales/assistant-query-service.js';
import {
  getCustomerCommercialSummaryInputSchema,
  getProfitabilitySummaryInputSchema,
  getReceivablesSummaryInputSchema,
  getSalesDocumentDetailInputSchema,
  searchCustomersInputSchema,
  searchSalesDocumentsInputSchema,
  type GetCustomerCommercialSummaryInput,
  type GetProfitabilitySummaryInput,
  type GetReceivablesSummaryInput,
  type GetSalesDocumentDetailInput,
  type SearchCustomersInput,
  type SearchSalesDocumentsInput,
} from './schemas.js';
import { createAssistantToolRegistry, toolParametersFromSchema } from './registry.js';
import type { AssistantTool, AssistantToolRegistry } from './types.js';

export type AssistantCommercialQueryPorts = {
  customers: CustomersAssistantQueryService;
  sales: SalesAssistantQueryService;
  receivables: ReceivablesAssistantQueryService;
  profitability: ProfitabilityAssistantQueryService;
};

export function createDefaultAssistantCommercialQueryPorts(): AssistantCommercialQueryPorts {
  return {
    customers: new CustomersAssistantQueryService(),
    sales: new SalesAssistantQueryService(),
    receivables: new ReceivablesAssistantQueryService(),
    profitability: new ProfitabilityAssistantQueryService(),
  };
}

export function createCommercialAssistantTools(
  ports: AssistantCommercialQueryPorts = createDefaultAssistantCommercialQueryPorts(),
): AssistantTool[] {
  return [
    {
      name: 'searchCustomers',
      description:
        'Search customers by name (or tax id digits for lookup only). Returns id, name, type, and app path. Never returns RNC, contacts, or notes.',
      inputSchema: searchCustomersInputSchema,
      parameters: toolParametersFromSchema(searchCustomersInputSchema),
      execute: (input, context) =>
        ports.customers.searchCustomers(
          context.actorId,
          input as SearchCustomersInput,
          context.now,
        ),
    },
    {
      name: 'getCustomerCommercialSummary',
      description:
        'Commercial summary for one customer: type, credit terms, open CxC balances, and credit exposure for CREDIT customers.',
      inputSchema: getCustomerCommercialSummaryInputSchema,
      parameters: toolParametersFromSchema(getCustomerCommercialSummaryInputSchema),
      execute: (input, context) =>
        ports.customers.getCommercialSummary(
          context.actorId,
          input as GetCustomerCommercialSummaryInput,
          context.now,
        ),
    },
    {
      name: 'searchSalesDocuments',
      description:
        'Search quotes (COT), conduces (CON), and invoices (FAC) by text, status, customer, or business dates.',
      inputSchema: searchSalesDocumentsInputSchema,
      parameters: toolParametersFromSchema(searchSalesDocumentsInputSchema),
      execute: (input, context) =>
        ports.sales.searchDocuments(
          context.actorId,
          input as SearchSalesDocumentsInput,
          context.now,
        ),
    },
    {
      name: 'getSalesDocumentDetail',
      description:
        'Read-only detail for one sales document: lines, payments, balance, and seller. Omits notes, RNC, NCF, and acquisition cost.',
      inputSchema: getSalesDocumentDetailInputSchema,
      parameters: toolParametersFromSchema(getSalesDocumentDetailInputSchema),
      execute: (input, context) =>
        ports.sales.getDocumentDetail(
          context.actorId,
          input as GetSalesDocumentDetailInput,
          context.now,
        ),
    },
    {
      name: 'getReceivablesSummary',
      description:
        'Accounts receivable summary with optional customer, FAC/CON type, overdue-only, and cut-off date filters. Up to 20 document stubs.',
      inputSchema: getReceivablesSummaryInputSchema,
      parameters: toolParametersFromSchema(getReceivablesSummaryInputSchema),
      execute: (input, context) =>
        ports.receivables.getSummary(
          context.actorId,
          input as GetReceivablesSummaryInput,
          context.now,
        ),
    },
    {
      name: 'getProfitabilitySummary',
      description:
        'Period profitability KPIs in DOP for DOP or USD sales (USD converted with stored FX; omitted without rate). Range max 366 days.',
      inputSchema: getProfitabilitySummaryInputSchema,
      parameters: toolParametersFromSchema(getProfitabilitySummaryInputSchema),
      execute: (input, context) =>
        ports.profitability.getSummary(
          context.actorId,
          input as GetProfitabilitySummaryInput,
          context.now,
        ),
    },
  ];
}

export function createCommercialAssistantToolRegistry(
  ports?: AssistantCommercialQueryPorts,
): AssistantToolRegistry {
  return createAssistantToolRegistry(createCommercialAssistantTools(ports));
}
