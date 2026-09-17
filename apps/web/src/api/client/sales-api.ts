import type { LineType } from '../contracts/entities';
import type {
  AddDraftLineInput,
  AddPaymentInput,
  CancelInvoiceInput,
  ConfirmInvoicePayment,
  CorrectCurrencyInput,
  CreateDraftResult,
  CustomerOutstandingRow,
  InvoiceDetailView,
  InvoiceDocumentView,
  InvoicePdfDownload,
  QuotePdfDownload,
  SalesDocumentPdfDownload,
  AccountStatementPdfDownload,
  PosDraftView,
  PosLineView,
  ReceivablesFilters,
  ReceivablesSnapshot,
  RemoveDraftLineInput,
  SalesListFilters,
  SalesListRow,
  SalesListTab,
  SetDraftLinePriceInput,
  SetDraftLineQuantityInput,
  SetDraftMetaInput,
} from '../contracts/sales';
import { LIST_PAGE_SIZE, type ListPage } from '../contracts/pagination';
import { err, ok, type Result } from '../../shared/auth/types';
import { listCustomersWithHttp } from './customers-api';
import { listServicesWithHttp } from './catalogs-api';
import { httpClient, httpClientBlob, toAppError } from './http-client';
import { httpNotImplemented } from './http-not-implemented';
import { toInvoiceProfitabilityView, type ApiProfitability } from './map-invoice-profitability';

const SALES_PATH = '/api/sales';
const CSRF_HEADERS = { 'X-Requested-With': 'XMLHttpRequest' };
const DEFAULT_DELIVERY_DESCRIPTION = 'Entrega';

type ApiCustomerView = {
  id: string;
  name: string;
  rnc: string | null;
  isDefault: boolean;
  customerType?: string;
};

type ApiInvoiceLine = {
  id: string;
  type: LineType;
  description: string;
  notes: string | null;
  quantity: string;
  unitPrice: string;
  taxable: boolean;
  gross: string;
  base: string;
  itbis: string;
  serviceId: string | null;
};

type ApiInvoiceDocument = { status: 'READY' } | { status: 'FAILED'; errorId: string };

type ApiPayment = {
  id: string;
  kind: 'PAYMENT' | 'REFUND';
  amount: string;
  method: 'CASH' | 'TRANSFER' | 'CHECK';
  effectiveDate: string;
  recordedAt: string;
  reference: string | null;
  actorName: string;
};

type ApiHistoryEntry = {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  actorName?: string;
};

type ApiInvoice = {
  id: string;
  status: 'DRAFT' | 'QUOTE_DRAFT' | 'QUOTE_ISSUED' | 'COMPLETED' | 'CANCELLED';
  number: string | null;
  quoteNumber?: string | null;
  quoteIssuedAt?: string | null;
  quoteExpiresAt?: string | null;
  quoteExpired?: boolean;
  currency: 'DOP' | 'USD';
  fiscal: boolean;
  applyItbis: boolean;
  customer: ApiCustomerView;
  createdAt: string;
  confirmedAt: string | null;
  dueDate: string | null;
  sellerName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledByName: string | null;
  paymentState?:
    | 'PENDING'
    | 'PARTIALLY_PAID'
    | 'OVERDUE'
    | 'PARTIALLY_PAID_OVERDUE'
    | 'PAID'
    | 'PAID_LATE'
    | 'CANCELLED';
  payments?: ApiPayment[];
  paid?: string;
  refunded?: string;
  balance?: string;
  lines: ApiInvoiceLine[];
  totals: { gross: string; base: string; itbis: string };
  profitability?: ApiProfitability;
  document?: ApiInvoiceDocument;
  history?: ApiHistoryEntry[];
};

type ApiInvoiceListItem = Omit<ApiInvoice, 'lines'>;

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

async function request<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await operation());
  } catch (error) {
    return err(toAppError(error));
  }
}

function moneyNumber(value: string): number {
  return Number(value);
}

function moneyString(value: number): string {
  return value.toFixed(2);
}

function optionalText(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

function toPosLine(line: ApiInvoiceLine): PosLineView {
  return {
    id: line.id,
    type: line.type,
    description: line.description,
    notes: optionalText(line.notes),
    quantity: moneyNumber(line.quantity),
    unitPrice: moneyNumber(line.unitPrice),
    taxable: line.taxable,
    pricePending: false,
    gross: moneyNumber(line.gross),
    itbis: moneyNumber(line.itbis),
    base: moneyNumber(line.base),
    serviceId: line.serviceId ?? undefined,
  };
}

function toCustomerType(value: ApiCustomerView['customerType']): PosDraftView['customerType'] {
  return value === 'CREDIT' ? 'CREDIT' : 'CASH';
}

function toPosDraft(
  invoice: ApiInvoice,
  customers: PosDraftView['customers'],
  services: PosDraftView['services'],
): PosDraftView {
  return {
    id: invoice.id,
    status: invoice.status,
    number: optionalText(invoice.number),
    quoteNumber: optionalText(invoice.quoteNumber),
    quoteIssuedAt: optionalText(invoice.quoteIssuedAt),
    quoteExpiresAt: optionalText(invoice.quoteExpiresAt),
    quoteExpired: invoice.quoteExpired === true,
    customerId: invoice.customer.id,
    customerName: invoice.customer.name,
    customerRnc: optionalText(invoice.customer.rnc),
    customerIsDefault: invoice.customer.isDefault,
    customerType: toCustomerType(invoice.customer.customerType),
    currency: invoice.currency,
    fiscal: invoice.fiscal,
    applyItbis: invoice.applyItbis,
    lines: invoice.lines.map(toPosLine),
    totals: {
      lineCount: invoice.lines.length,
      gross: moneyNumber(invoice.totals.gross),
      itbis: moneyNumber(invoice.totals.itbis),
      taxableBase: moneyNumber(invoice.totals.base),
    },
    customers,
    services,
    qtyProducts: [],
    items: [],
    blockers: [],
    createdWorkOrderIds: [],
  };
}

function invoiceListNumber(item: ApiInvoiceListItem): string {
  if (item.number) return item.number;
  if (item.quoteNumber) return item.quoteNumber;
  return item.status === 'QUOTE_DRAFT'
    ? 'Cotización borrador'
    : item.status === 'DRAFT'
      ? 'Borrador'
      : 'Factura';
}

function invoiceHref(item: ApiInvoiceListItem): string {
  return item.status === 'DRAFT'
    ? `/sales/draft/${item.id}`
    : item.status === 'QUOTE_DRAFT' || item.status === 'QUOTE_ISSUED'
      ? `/sales/quote/${item.id}`
      : `/sales/${item.id}`;
}

function toSalesListRow(item: ApiInvoiceListItem): SalesListRow {
  const total = moneyNumber(item.totals.gross);

  return {
    id: item.id,
    number: invoiceListNumber(item),
    quoteNumber: optionalText(item.quoteNumber),
    status: item.status,
    customerId: item.customer.id,
    customerName: item.customer.name,
    currency: item.currency,
    fiscal: item.fiscal,
    total,
    createdAt: item.createdAt,
    confirmedAt: optionalText(item.confirmedAt),
    dueDate: optionalText(item.dueDate),
    quoteIssuedAt: optionalText(item.quoteIssuedAt),
    quoteExpiresAt: optionalText(item.quoteExpiresAt),
    quoteExpired: item.quoteExpired === true,
    href: invoiceHref(item),
    ...(item.paymentState ? { paymentState: item.paymentState } : {}),
    ...(item.balance != null ? { balance: moneyNumber(item.balance) } : {}),
  };
}

type ApiCustomerOutstanding = {
  customerId: string;
  customerName: string;
  currency: 'DOP' | 'USD';
  invoiceCount: number;
  invoiced: string;
  paid: string;
  balance: string;
};

type ApiReceivables = {
  invoices: Array<ApiInvoiceListItem & { paid: string }>;
  customers: ApiCustomerOutstanding[];
  total: number;
  page: number;
  pageSize: number;
};

function toCustomerOutstanding(row: ApiCustomerOutstanding): CustomerOutstandingRow {
  return {
    customerId: row.customerId,
    customerName: row.customerName,
    currency: row.currency,
    invoiceCount: row.invoiceCount,
    invoiced: moneyNumber(row.invoiced),
    paid: moneyNumber(row.paid),
    balance: moneyNumber(row.balance),
  };
}

function toInvoiceDocument(
  document: ApiInvoiceDocument | undefined,
): InvoiceDocumentView | undefined {
  if (document?.status === 'READY') return { status: 'READY' };
  if (document?.status === 'FAILED' && document.errorId) {
    return { status: 'FAILED', errorId: document.errorId };
  }
  return undefined;
}

function toInvoiceDetail(invoice: ApiInvoice): InvoiceDetailView {
  const total = moneyNumber(invoice.totals.gross);
  const document = toInvoiceDocument(invoice.document);

  return {
    id: invoice.id,
    number: optionalText(invoice.number),
    quoteNumber: optionalText(invoice.quoteNumber),
    status: invoice.status,
    customerId: invoice.customer.id,
    customerName: invoice.customer.name,
    customerRnc: optionalText(invoice.customer.rnc),
    currency: invoice.currency,
    fiscal: invoice.fiscal,
    applyItbis: invoice.applyItbis,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      type: line.type,
      description: line.description,
      notes: optionalText(line.notes),
      quantity: moneyNumber(line.quantity),
      unitPrice: moneyNumber(line.unitPrice),
      taxable: line.taxable,
      gross: moneyNumber(line.gross),
      base: moneyNumber(line.base),
      itbis: moneyNumber(line.itbis),
    })),
    payments: (invoice.payments ?? []).map((payment) => ({
      id: payment.id,
      kind: payment.kind,
      amount: moneyNumber(payment.amount),
      method: payment.method,
      createdAt: payment.effectiveDate,
      effectiveDate: payment.effectiveDate,
      recordedAt: payment.recordedAt,
      reference: optionalText(payment.reference),
      actorName: payment.actorName,
    })),
    total,
    createdAt: invoice.createdAt,
    confirmedAt: optionalText(invoice.confirmedAt),
    dueDate: optionalText(invoice.dueDate),
    sellerName: optionalText(invoice.sellerName),
    cancelledAt: optionalText(invoice.cancelledAt),
    cancelReason: optionalText(invoice.cancelReason),
    cancelledByName: optionalText(invoice.cancelledByName),
    linkedWorkOrders: [],
    history: (invoice.history ?? []).map((event) => ({
      id: event.id,
      type: event.type,
      description: event.description,
      createdAt: event.createdAt,
      actorName: optionalText(event.actorName),
    })),
    document,
    ...(invoice.profitability
      ? { profitability: toInvoiceProfitabilityView(invoice.profitability) }
      : {}),
    ...(invoice.paymentState ? { paymentState: invoice.paymentState } : {}),
    ...(invoice.paid != null ? { paid: moneyNumber(invoice.paid) } : {}),
    ...(invoice.refunded != null ? { refunded: moneyNumber(invoice.refunded) } : {}),
    ...(invoice.balance != null ? { balance: moneyNumber(invoice.balance) } : {}),
    actions: {
      // HTTP mapper has no viewer role; InvoiceDetailPage requires ADMINISTRATOR.
      canPay:
        invoice.status === 'COMPLETED' &&
        invoice.balance != null &&
        moneyNumber(invoice.balance) > 0,
      canCancel: invoice.status === 'COMPLETED',
      canCorrectCurrency: false,
      canViewPdf: document?.status === 'READY',
      canRegeneratePdf: document?.status === 'FAILED',
    },
  };
}

function optionalNotesBody(notes: string | null | undefined): { notes?: string | null } {
  if (notes === undefined) return {};
  const trimmed = notes?.trim() ?? '';
  return { notes: trimmed === '' ? null : trimmed };
}

export function toHttpAddLineBody(input: AddDraftLineInput): Record<string, unknown> {
  const notes = optionalNotesBody(input.notes);

  if (input.type === 'GENERIC' || input.type === 'EXTERNAL') {
    return {
      type: input.type,
      description: input.description?.trim() ?? '',
      unitPrice: moneyString(input.unitPrice ?? 0),
      ...(input.quantity != null ? { quantity: moneyString(input.quantity) } : {}),
      ...notes,
    };
  }

  if (input.type === 'SERVICE') {
    return {
      type: 'SERVICE',
      serviceId: input.serviceId,
      unitPrice: moneyString(input.unitPrice ?? 0),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...notes,
    };
  }

  if (input.type === 'DELIVERY') {
    return {
      type: 'DELIVERY',
      description: input.description?.trim() || DEFAULT_DELIVERY_DESCRIPTION,
      unitPrice: moneyString(input.unitPrice ?? 0),
      ...notes,
    };
  }

  return { type: input.type, ...notes };
}

function invoicesCollectionPath(
  page: number,
  status?: ApiInvoice['status'],
  q?: string,
  filters: SalesListFilters = {},
): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('page', String(page));
  params.set('pageSize', String(LIST_PAGE_SIZE));
  const normalized = q?.trim();
  if (normalized) params.set('q', normalized);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  return `${SALES_PATH}?${params.toString()}`;
}

async function loadPosLookups(): Promise<
  Result<{ customers: PosDraftView['customers']; services: PosDraftView['services'] }>
> {
  const [customersResult, servicesResult] = await Promise.all([
    listCustomersWithHttp(),
    listServicesWithHttp(),
  ]);
  if (!customersResult.ok) return customersResult;
  if (!servicesResult.ok) return servicesResult;

  return ok({
    customers: customersResult.value.map((customer) => ({
      id: customer.id,
      name: customer.name,
      rnc: customer.rnc,
      isDefault: customer.isDefault,
    })),
    services: servicesResult.value
      .filter((service) => service.active)
      .map((service) => ({ id: service.id, name: service.name })),
  });
}

async function toPosDraftView(invoice: ApiInvoice): Promise<Result<PosDraftView>> {
  const lookups = await loadPosLookups();
  if (!lookups.ok) return lookups;

  const services = [...lookups.value.services];
  for (const line of invoice.lines) {
    if (line.serviceId && !services.some((service) => service.id === line.serviceId)) {
      services.push({ id: line.serviceId, name: line.description });
    }
  }

  return ok(toPosDraft(invoice, lookups.value.customers, services));
}

async function mutateDraft(operation: () => Promise<ApiInvoice>): Promise<Result<PosDraftView>> {
  let invoice: ApiInvoice;
  try {
    invoice = await operation();
  } catch (error) {
    return err(toAppError(error));
  }

  const view = await toPosDraftView(invoice);
  if (view.ok) return view;

  // The write already succeeded, so an auxiliary lookup failure must not invite a duplicate retry.
  const services: PosDraftView['services'] = [];
  for (const line of invoice.lines) {
    if (line.serviceId && !services.some((service) => service.id === line.serviceId)) {
      services.push({ id: line.serviceId, name: line.description });
    }
  }
  return ok(
    toPosDraft(
      invoice,
      [
        {
          id: invoice.customer.id,
          name: invoice.customer.name,
          rnc: optionalText(invoice.customer.rnc),
          isDefault: invoice.customer.isDefault,
        },
      ],
      services,
    ),
  );
}

export function listInvoicesWithHttp(
  tab: SalesListTab = 'ALL',
  page = 1,
  q?: string,
  filters: SalesListFilters = {},
): Promise<Result<ListPage<SalesListRow>>> {
  return request(async () => {
    const status = tab === 'ALL' ? undefined : tab;
    const response = await httpClient<Page<ApiInvoiceListItem>>(
      invoicesCollectionPath(page, status, q, filters),
    );
    return {
      items: response.items.map(toSalesListRow),
      total: response.total,
      page: response.page,
      pageSize: response.pageSize,
    };
  });
}

export function listReceivablesWithHttp(
  page = 1,
  filters: ReceivablesFilters = {},
): Promise<Result<ReceivablesSnapshot>> {
  return request(async () => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(LIST_PAGE_SIZE),
    });
    if (filters.customerId) params.set('customerId', filters.customerId);
    if (filters.invoice) params.set('invoice', filters.invoice);
    const response = await httpClient<ApiReceivables>(`${SALES_PATH}/receivables?${params}`);
    return {
      invoices: response.invoices.map((item) => toSalesListRow(item)),
      customers: response.customers.map(toCustomerOutstanding),
      total: response.total,
      page: response.page,
      pageSize: response.pageSize,
    };
  });
}

export function getInvoiceWithHttp(id: string): Promise<Result<InvoiceDetailView>> {
  return request(async () => {
    const invoice = await httpClient<ApiInvoice>(`${SALES_PATH}/${id}`);
    return toInvoiceDetail(invoice);
  });
}

function getSalesDocumentPdfWithHttp(id: string): Promise<Result<SalesDocumentPdfDownload>> {
  return request(() => httpClientBlob(`${SALES_PATH}/${id}/pdf`));
}

export function getInvoicePdfWithHttp(id: string): Promise<Result<InvoicePdfDownload>> {
  return getSalesDocumentPdfWithHttp(id);
}

export function getQuotePdfWithHttp(id: string): Promise<Result<QuotePdfDownload>> {
  return getSalesDocumentPdfWithHttp(id);
}

export function getAccountStatementPdfWithHttp(
  customerId: string,
): Promise<Result<AccountStatementPdfDownload>> {
  return request(() =>
    httpClientBlob(`${SALES_PATH}/receivables/${encodeURIComponent(customerId)}/statement.pdf`),
  );
}

export function regenerateInvoicePdfWithHttp(id: string): Promise<Result<InvoiceDetailView>> {
  return request(async () => {
    const invoice = await httpClient<ApiInvoice>(`${SALES_PATH}/${id}/pdf/regenerate`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({}),
    });
    return toInvoiceDetail(invoice);
  });
}

export async function addPaymentWithHttp(
  input: AddPaymentInput,
): Promise<Result<InvoiceDetailView>> {
  return request(async () => {
    const invoice = await httpClient<ApiInvoice>(`${SALES_PATH}/${input.invoiceId}/payments`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        amount: moneyString(input.amount),
        method: input.method,
        effectiveDate: input.effectiveDate,
        reference: input.reference,
        idempotencyKey: input.idempotencyKey,
      }),
    });
    return toInvoiceDetail(invoice);
  });
}

export async function cancelInvoiceWithHttp(
  input: CancelInvoiceInput,
): Promise<Result<InvoiceDetailView>> {
  return request(async () => {
    const invoice = await httpClient<ApiInvoice>(`${SALES_PATH}/${input.invoiceId}/cancel`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        reason: input.reason,
        refundMethod: input.refundMethod,
        refundReference: input.refundReference,
        idempotencyKey: input.idempotencyKey,
      }),
    });
    return toInvoiceDetail(invoice);
  });
}

export async function correctCurrencyWithHttp(
  _input: CorrectCurrencyInput,
): Promise<Result<InvoiceDetailView>> {
  return httpNotImplemented('HttpSalesRepository', 'correctCurrency');
}

export function createDraftWithHttp(): Promise<Result<CreateDraftResult>> {
  return request(async () => {
    const invoice = await httpClient<ApiInvoice>(SALES_PATH, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({}),
    });
    return { draftId: invoice.id };
  });
}

export function createQuoteWithHttp(): Promise<Result<CreateDraftResult>> {
  return request(async () => {
    const invoice = await httpClient<ApiInvoice>(`${SALES_PATH}/quotes`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({}),
    });
    return { draftId: invoice.id };
  });
}

export async function getDraftWithHttp(id: string): Promise<Result<PosDraftView>> {
  try {
    const invoice = await httpClient<ApiInvoice>(`${SALES_PATH}/${id}`);
    return toPosDraftView(invoice);
  } catch (error) {
    return err(toAppError(error));
  }
}

export function addDraftLineWithHttp(input: AddDraftLineInput): Promise<Result<PosDraftView>> {
  return mutateDraft(() =>
    httpClient<ApiInvoice>(`${SALES_PATH}/${input.draftId}/lines`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify(toHttpAddLineBody(input)),
    }),
  );
}

export function removeDraftLineWithHttp(
  input: RemoveDraftLineInput,
): Promise<Result<PosDraftView>> {
  return mutateDraft(() =>
    httpClient<ApiInvoice>(`${SALES_PATH}/${input.draftId}/lines/${input.lineId}`, {
      method: 'DELETE',
      headers: CSRF_HEADERS,
    }),
  );
}

export function setDraftLinePriceWithHttp(
  input: SetDraftLinePriceInput,
): Promise<Result<PosDraftView>> {
  const body: Record<string, unknown> = {};
  if (input.unitPrice !== undefined) body.unitPrice = moneyString(input.unitPrice);
  if (input.quantity !== undefined) body.quantity = moneyString(input.quantity);
  if (input.description !== undefined) body.description = input.description.trim();
  if (input.notes !== undefined) {
    const trimmed = input.notes?.trim() ?? '';
    body.notes = trimmed === '' ? null : trimmed;
  }

  return mutateDraft(() =>
    httpClient<ApiInvoice>(`${SALES_PATH}/${input.draftId}/lines/${input.lineId}`, {
      method: 'PATCH',
      headers: CSRF_HEADERS,
      body: JSON.stringify(body),
    }),
  );
}

export function setDraftLineQuantityWithHttp(
  input: SetDraftLineQuantityInput,
): Promise<Result<PosDraftView>> {
  return mutateDraft(() =>
    httpClient<ApiInvoice>(`${SALES_PATH}/${input.draftId}/lines/${input.lineId}`, {
      method: 'PATCH',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ quantity: moneyString(input.quantity) }),
    }),
  );
}

export function setDraftMetaWithHttp(input: SetDraftMetaInput): Promise<Result<PosDraftView>> {
  const body: Record<string, unknown> = {};
  if (input.customerId !== undefined) body.customerId = input.customerId;
  if (input.currency !== undefined) body.currency = input.currency;
  if (input.fiscal !== undefined) body.fiscal = input.fiscal;
  if (input.applyItbis !== undefined) body.applyItbis = input.applyItbis;

  return mutateDraft(() =>
    httpClient<ApiInvoice>(`${SALES_PATH}/${input.draftId}`, {
      method: 'PATCH',
      headers: CSRF_HEADERS,
      body: JSON.stringify(body),
    }),
  );
}

export function confirmInvoiceWithHttp(
  draftId: string,
  payment?: ConfirmInvoicePayment,
): Promise<Result<PosDraftView>> {
  return mutateDraft(() =>
    httpClient<ApiInvoice>(`${SALES_PATH}/${draftId}/confirm`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify(
        payment
          ? {
              payment: {
                amount: moneyString(payment.amount),
                method: payment.method,
                reference: payment.reference,
                idempotencyKey: payment.idempotencyKey,
              },
            }
          : {},
      ),
    }),
  );
}

export function issueQuoteWithHttp(quoteId: string): Promise<Result<PosDraftView>> {
  return mutateDraft(() =>
    httpClient<ApiInvoice>(`${SALES_PATH}/${quoteId}/issue-quote`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({}),
    }),
  );
}

export function duplicateQuoteWithHttp(quoteId: string): Promise<Result<CreateDraftResult>> {
  return request(async () => {
    const invoice = await httpClient<ApiInvoice>(`${SALES_PATH}/${quoteId}/duplicate-quote`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({}),
    });
    return { draftId: invoice.id };
  });
}

export function convertQuoteWithHttp(
  quoteId: string,
  payment?: ConfirmInvoicePayment,
): Promise<Result<PosDraftView>> {
  return mutateDraft(() =>
    httpClient<ApiInvoice>(`${SALES_PATH}/${quoteId}/convert-quote`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify(
        payment ? { payment: { ...payment, amount: moneyString(payment.amount) } } : {},
      ),
    }),
  );
}

export function discardDraftWithHttp(draftId: string): Promise<Result<void>> {
  return request(async () => {
    await httpClient<void>(`${SALES_PATH}/${draftId}`, {
      method: 'DELETE',
      headers: CSRF_HEADERS,
      parseJson: false,
    });
  });
}
