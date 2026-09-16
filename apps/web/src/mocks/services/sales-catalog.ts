import type { AppState, Invoice, User } from '../../api/contracts/entities';
import type {
  CustomerOutstandingRow,
  InvoiceDetailView,
  InvoiceLineView,
  ReceivablesSnapshot,
  SalesListRow,
  SalesListTab,
} from '../../api/contracts/sales';
import { LIST_PAGE_SIZE } from '../../api/contracts/pagination';
import { can } from '../../shared/auth/policies';
import {
  invoiceBalance,
  invoicePaid,
  invoiceRefunded,
  invoiceTotal,
  lineBase,
  lineGross,
  lineItbis,
  roundMoney,
} from './invoice-money';
import { profitabilityForInvoice } from './profitability-view';
import { resolveActorName, toHistoryEventView } from './history-view';
import { currentDemoTimeIso } from '../data/demo-clock';

const ADMINISTRATOR_ONLY_INVOICE_EVENTS = new Set(['PAYMENT_RECORDED']);

function customerName(state: AppState, invoice: Invoice): string {
  return (
    invoice.customerSnapshot?.name ??
    state.customers.find((entry) => entry.id === invoice.customerId)?.name ??
    invoice.customerId
  );
}

function draftHref(invoice: Invoice): string {
  if (invoice.status === 'DRAFT') return `/sales/draft/${invoice.id}`;
  if (invoice.status === 'QUOTE_DRAFT' || invoice.status === 'QUOTE_ISSUED') {
    return `/sales/quote/${invoice.id}`;
  }
  return `/sales/${invoice.id}`;
}

function displayNumber(invoice: Invoice): string {
  if (invoice.number) {
    return invoice.number;
  }
  if (invoice.quoteNumber) return invoice.quoteNumber;
  if (invoice.status === 'QUOTE_DRAFT') return 'Cotización borrador';
  return invoice.status === 'DRAFT' ? 'Borrador' : 'Factura';
}

export function toSalesListRow(
  state: AppState,
  invoice: Invoice,
  options: { includePaymentSettlement?: boolean } = {},
): SalesListRow {
  const includePaymentSettlement = options.includePaymentSettlement !== false;
  return {
    id: invoice.id,
    number: displayNumber(invoice),
    quoteNumber: invoice.quoteNumber,
    status: invoice.status,
    customerId: invoice.customerId,
    customerName: customerName(state, invoice),
    currency: invoice.currency,
    fiscal: invoice.fiscal,
    total: invoiceTotal(invoice),
    createdAt: invoice.createdAt,
    confirmedAt: invoice.confirmedAt,
    dueDate: invoice.dueDate,
    quoteIssuedAt: invoice.quoteIssuedAt,
    quoteExpiresAt: invoice.quoteExpiresAt,
    quoteExpired:
      invoice.status === 'QUOTE_ISSUED' &&
      Boolean(
        invoice.quoteExpiresAt &&
        Date.parse(invoice.quoteExpiresAt) < Date.parse(currentDemoTimeIso()),
      ),
    href: draftHref(invoice),
    ...(includePaymentSettlement &&
    (invoice.status === 'COMPLETED' || invoice.status === 'CANCELLED')
      ? { paymentState: invoice.paymentState, balance: invoiceBalance(invoice) }
      : {}),
  };
}

export function matchesSalesTab(invoice: Invoice, tab: SalesListTab): boolean {
  if (tab === 'ALL') {
    return true;
  }
  return invoice.status === tab;
}

export function matchesSalesSearch(row: SalesListRow, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }

  return (
    row.number.toLowerCase().includes(normalized) ||
    (row.quoteNumber?.toLowerCase().includes(normalized) ?? false) ||
    row.customerName.toLowerCase().includes(normalized) ||
    row.id.toLowerCase().includes(normalized)
  );
}

export function buildSalesList(
  state: AppState,
  tab: SalesListTab = 'ALL',
  q = '',
  actor?: User,
): SalesListRow[] {
  const includePaymentSettlement = actor?.role !== 'SELLER';
  return [...state.invoices]
    .filter((invoice) => matchesSalesTab(invoice, tab))
    .sort((left, right) => {
      const leftKey = left.confirmedAt ?? left.createdAt;
      const rightKey = right.confirmedAt ?? right.createdAt;
      return rightKey.localeCompare(leftKey);
    })
    .map((invoice) => toSalesListRow(state, invoice, { includePaymentSettlement }))
    .filter((row) => matchesSalesSearch(row, q));
}

export function buildReceivables(state: AppState): ReceivablesSnapshot {
  const invoices = [...state.invoices]
    .filter((invoice) => invoice.status === 'COMPLETED' && invoiceBalance(invoice) > 0)
    .sort((left, right) =>
      (left.dueDate ?? left.createdAt).localeCompare(right.dueDate ?? right.createdAt),
    )
    .map((invoice) => toSalesListRow(state, invoice));

  const grouped = new Map<string, CustomerOutstandingRow>();
  for (const row of invoices) {
    const key = `${row.customerId}:${row.currency}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.invoiceCount += 1;
      existing.invoiced = roundMoney(existing.invoiced + row.total);
      existing.paid = roundMoney(existing.paid + (row.total - (row.balance ?? 0)));
      existing.balance = roundMoney(existing.balance + (row.balance ?? 0));
      continue;
    }
    grouped.set(key, {
      customerId: row.customerId,
      customerName: row.customerName,
      currency: row.currency,
      invoiceCount: 1,
      invoiced: row.total,
      paid: roundMoney(row.total - (row.balance ?? 0)),
      balance: row.balance ?? 0,
    });
  }

  return {
    invoices,
    customers: [...grouped.values()].sort((left, right) => {
      const name = left.customerName.localeCompare(right.customerName, 'es');
      return name !== 0 ? name : left.currency.localeCompare(right.currency);
    }),
    total: invoices.length,
    page: 1,
    pageSize: LIST_PAGE_SIZE,
  };
}

function toLineView(line: Invoice['lines'][number], applyItbis: boolean): InvoiceLineView {
  return {
    id: line.id,
    type: line.type,
    description: line.description,
    notes: line.notes,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxable: line.taxable,
    gross: lineGross(line, applyItbis),
    base: lineBase(line),
    itbis: lineItbis(line, applyItbis),
  };
}

function isLinkedInvoiceEvent(event: AppState['events'][number], invoice: Invoice): boolean {
  if (event.metadata?.invoiceId === invoice.id) {
    return true;
  }
  if (invoice.number && event.description.includes(invoice.number)) {
    return true;
  }
  return event.description.includes(invoice.id);
}

export function buildInvoiceDetail(
  state: AppState,
  invoice: Invoice,
  actor: User,
): InvoiceDetailView {
  const customer = state.customers.find((entry) => entry.id === invoice.customerId);
  const completed = invoice.status === 'COMPLETED';
  const numbered = invoice.status === 'COMPLETED' || invoice.status === 'CANCELLED';

  return {
    id: invoice.id,
    number: invoice.number,
    quoteNumber: invoice.quoteNumber,
    status: invoice.status,
    customerId: invoice.customerId,
    customerName: invoice.customerSnapshot?.name ?? customer?.name ?? invoice.customerId,
    customerRnc: invoice.customerSnapshot?.rnc ?? customer?.rnc,
    currency: invoice.currency,
    fiscal: invoice.fiscal,
    applyItbis: invoice.applyItbis === true,
    lines: invoice.lines.map((line) => toLineView(line, invoice.applyItbis === true)),
    payments:
      actor.role === 'ADMINISTRATOR'
        ? invoice.payments.map((payment) => ({
            id: payment.id,
            kind: payment.kind === 'REFUND' ? 'REFUND' : 'PAYMENT',
            amount: payment.amount,
            method: payment.method,
            createdAt: payment.createdAt,
            reference: payment.reference,
            actorName: resolveActorName(state.users, payment.actorId),
          }))
        : [],
    total: invoiceTotal(invoice),
    ...(actor.role === 'ADMINISTRATOR'
      ? {
          paymentState: invoice.paymentState,
          paid: invoicePaid(invoice),
          refunded: invoiceRefunded(invoice),
          balance: invoiceBalance(invoice),
        }
      : {}),
    createdAt: invoice.createdAt,
    confirmedAt: invoice.confirmedAt,
    cancelledAt: invoice.cancelledAt,
    cancelReason: invoice.cancelReason,
    linkedWorkOrders: state.workOrders
      .filter(
        (order) =>
          order.invoiceId === invoice.id || Boolean(order.linkedInvoiceIds?.includes(invoice.id)),
      )
      .map((order) => ({
        id: order.id,
        type: order.type,
        status: order.status,
        pieceId: order.pieceId,
        pieceName: state.items.find((item) => item.id === order.pieceId)?.name ?? order.pieceId,
      })),
    history: state.events
      .filter((event) => isLinkedInvoiceEvent(event, invoice))
      .filter(
        (event) =>
          actor.role === 'ADMINISTRATOR' || !ADMINISTRATOR_ONLY_INVOICE_EVENTS.has(event.type),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((event) => toHistoryEventView(event, state.users)),
    profitability: profitabilityForInvoice(state, invoice, actor),
    actions: {
      canPay:
        completed &&
        actor.role === 'ADMINISTRATOR' &&
        can(actor, 'sales.manage') &&
        invoiceBalance(invoice) > 0,
      canCancel: completed && can(actor, 'sales.cancel'),
      canCorrectCurrency:
        completed &&
        can(actor, 'sales.correctCurrency') &&
        invoice.payments.length === 0 &&
        invoice.paymentState !== 'PAID',
      canViewPdf: numbered && Boolean(invoice.number),
      canRegeneratePdf: false,
    },
    deliveredAssemblies: invoice.deliveredAssemblies,
  };
}
