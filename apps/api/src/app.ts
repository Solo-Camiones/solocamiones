import './types/express.js';

import express, { type Router } from 'express';
import helmet from 'helmet';

import { accessRouter } from './features/access/routes.js';
import { catalogsRouter } from './features/catalogs/routes.js';
import { customersRouter } from './features/customers/routes.js';
import { createAssistantService } from './features/assistant/create-service.js';
import { createAssistantRouter } from './features/assistant/routes.js';
import { AssistantService } from './features/assistant/service.js';
import { profitabilityRouter } from './features/profitability/routes.js';
import { ProfitabilityService } from './features/profitability/service.js';
import { InvoiceDocumentService } from './features/invoice-documents/service.js';
import { salesRouter } from './features/sales/routes.js';
import { AccountStatementService } from './features/payments/account-statement-service.js';
import { SalesService } from './features/sales/service.js';
import { SellerSalesReportService } from './features/sales/seller-sales-report-service.js';
import { SellerSalesReportRepository } from './features/sales/seller-sales-report-repository.js';
import { SalesRepository } from './features/sales/repository.js';
import { salesTransaction } from './features/sales/transaction.js';
import { healthRouter } from './features/health/routes.js';
import { usersRouter } from './features/users/routes.js';
import {
  errorHandler,
  notFoundHandler,
  requestIdMiddleware,
  requestLoggingMiddleware,
  createApiRateLimiter,
} from './infrastructure/http/index.js';
import { createFxRateProvider, type FxRateProvider } from './infrastructure/fx/index.js';
import {
  pdfkitInvoicePdfRenderer,
  type InvoicePdfRenderer,
} from './infrastructure/invoice-pdf/index.js';
import {
  pdfkitQuotePdfRenderer,
  type QuotePdfRenderer,
} from './infrastructure/quote-pdf/index.js';
import {
  pdfkitAccountStatementRenderer,
  type AccountStatementPdfRenderer,
} from './infrastructure/account-statement-pdf/index.js';
import {
  pdfkitSellerSalesRenderer,
  type SellerSalesPdfRenderer,
} from './infrastructure/seller-sales-pdf/index.js';
import {
  parseAssistantConfig,
  type AssistantConfig,
} from './infrastructure/openai/index.js';

export type CreateAppOptions = {
  /** Test-only routers, mounted after feature routes and before the 404 handler. */
  extraRouters?: Array<{ path: string; router: Router }>;
  /**
   * When true, honor one X-Forwarded-For hop from the immediate peer.
   * Defaults to TRUST_PROXY=1|true. Leave unset unless the API is reached only via nginx.
   */
  trustProxy?: boolean;
  /** Test double for COST-003. Production uses ExchangeRate-API via env. */
  fxRateProvider?: FxRateProvider;
  /** Test double for SALE-004. Production uses pdfkit. */
  invoicePdfRenderer?: InvoicePdfRenderer;
  /** Test double for DOC-001 quote PDFs. Production uses pdfkit. */
  quotePdfRenderer?: QuotePdfRenderer;
  /** Test double for STMT-001. Production uses its dedicated pdfkit renderer. */
  accountStatementPdfRenderer?: AccountStatementPdfRenderer;
  /** Test double for seller-sales PDF. Production uses its dedicated pdfkit renderer. */
  sellerSalesPdfRenderer?: SellerSalesPdfRenderer;
  /** Override for tests. Production defaults to 100 requests per 15-minute window. */
  apiRateLimitMaxRequests?: number;
  /** Override assistant config (tests). Defaults to parseAssistantConfig(). */
  assistantConfig?: AssistantConfig;
  /** Override assistant service (tests). Defaults to createAssistantService(config). */
  assistantService?: AssistantService;
};

/** Matches body-parser's default; bodies over this size map to 413 PAYLOAD_TOO_LARGE. */
export const JSON_BODY_LIMIT_BYTES = 100 * 1024;

export function isTrustProxyEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

/** Honor X-Forwarded-For only for the immediate hop, and only when explicitly enabled. */
export function trustImmediateProxyHop(_address: string, hop: number, enabled: boolean): boolean {
  return enabled && hop === 0;
}

export function createApp(options: CreateAppOptions = {}): express.Application {
  const app = express();
  const trustProxy = options.trustProxy ?? isTrustProxyEnabled(process.env.TRUST_PROXY);
  const fxRateProvider = options.fxRateProvider ?? createFxRateProvider();
  const invoiceDocuments = new InvoiceDocumentService(
    salesTransaction,
    options.invoicePdfRenderer ?? pdfkitInvoicePdfRenderer,
    options.quotePdfRenderer ?? pdfkitQuotePdfRenderer,
  );
  const salesService = new SalesService(
    salesTransaction,
    fxRateProvider,
    new SalesRepository(),
    invoiceDocuments,
  );
  const profitabilityService = new ProfitabilityService(salesTransaction, fxRateProvider);
  const accountStatementService = new AccountStatementService(
    salesTransaction,
    options.accountStatementPdfRenderer ?? pdfkitAccountStatementRenderer,
  );
  const sellerSalesReportService = new SellerSalesReportService(
    salesTransaction,
    new SellerSalesReportRepository(),
    options.sellerSalesPdfRenderer ?? pdfkitSellerSalesRenderer,
  );
  const assistantConfig = options.assistantConfig ?? parseAssistantConfig();
  const assistantService =
    options.assistantService ?? createAssistantService(assistantConfig);
  const apiRateLimiter = createApiRateLimiter(options.apiRateLimitMaxRequests);
  app.locals.salesService = salesService;
  app.locals.profitabilityService = profitabilityService;
  app.locals.accountStatementService = accountStatementService;
  app.locals.sellerSalesReportService = sellerSalesReportService;
  app.locals.assistantService = assistantService;
  app.locals.assistantConfig = assistantConfig;

  // nginx replaces X-Forwarded-For with one client address. Enable only behind that unpublished hop.
  app.set('trust proxy', (address: string, hop: number) =>
    trustImmediateProxyHop(address, hop, trustProxy),
  );

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(requestLoggingMiddleware);
  app.use(express.json({ limit: JSON_BODY_LIMIT_BYTES }));
  app.use('/api/health', healthRouter);
  app.use('/api/auth', apiRateLimiter, accessRouter);
  app.use('/api/admin/users', apiRateLimiter, usersRouter);
  app.use('/api/customers', apiRateLimiter, customersRouter);
  app.use('/api/catalogs/services', apiRateLimiter, catalogsRouter);
  app.use('/api/sales', apiRateLimiter, salesRouter);
  app.use('/api/profitability', apiRateLimiter, profitabilityRouter);
  app.use(
    '/api/assistant',
    apiRateLimiter,
    createAssistantRouter({ maxInputChars: assistantConfig.maxInputChars }),
  );

  for (const extraRouter of options.extraRouters ?? []) {
    app.use(extraRouter.path, extraRouter.router);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
