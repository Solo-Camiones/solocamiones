import type { Role } from '@prisma/client';

export type InvoiceHistoryRow = {
  id: string;
  occurredAt: Date;
  eventType: string;
  actor: { name: string } | null;
  payload: unknown;
};

export type InvoiceHistoryEntryView = {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  actorName?: string;
};

// Profit/FX stay Administrator-only. PAY-007 also hides payment movements from Seller.
const ADMINISTRATOR_ONLY_EVENTS = new Set([
  'INVOICE_GROSS_PROFIT_RECORDED',
  'INVOICE_USD_FX_RECORDED',
  'INVOICE_USD_FX_RETRIED',
  'PAYMENT_RECORDED',
]);

const HIDDEN_INVOICE_TIMELINE_EVENTS = new Set([
  'INVOICE_DRAFT_UPDATED',
  'INVOICE_LINE_ADDED',
  'INVOICE_LINE_UPDATED',
  'INVOICE_LINE_REMOVED',
]);

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'efectivo',
  TRANSFER: 'transferencia',
  CHECK: 'cheque',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(value: unknown, key: string): string | undefined {
  const record = asRecord(value);
  const field = record?.[key];
  return typeof field === 'string' && field.length > 0 ? field : undefined;
}

function paymentMethodLabel(method: string | undefined): string {
  if (!method) return 'pago';
  return PAYMENT_METHOD_LABELS[method] ?? method.toLowerCase();
}

const EXCHANGE_RATE_API_SOURCE = 'ExchangeRate-API';
const DEMO_FX_SOURCE = 'DEMO_FX';

function fxSourcePhrase(source: string): string {
  if (source === DEMO_FX_SOURCE) return 'tasa de demostración';
  if (source === EXCHANGE_RATE_API_SOURCE) return 'proveedor de tipo de cambio';
  return `origen del tipo de cambio · ${source}`;
}

function fxRecordedDescription(payload: unknown): string {
  const after = asRecord(asRecord(payload)?.after);
  const rate = stringField(after, 'exchangeRateDopPerUsd');
  const source = stringField(after, 'source');
  if (!rate || !source) return 'Tasa USD registrada';
  return `Tasa USD ${rate} DOP/USD registrada (${fxSourcePhrase(source)})`;
}

function describeInvoiceHistoryEvent(row: InvoiceHistoryRow): string | null {
  const payload = row.payload;
  switch (row.eventType) {
    case 'INVOICE_DRAFT_CREATED':
      return 'Borrador creado';
    case 'INVOICE_DRAFT_DISCARDED':
      return 'Borrador descartado';
    case 'QUOTE_DRAFT_CREATED':
      return 'Borrador de cotización creado';
    case 'QUOTE_ISSUED': {
      const number = stringField(payload, 'quoteNumber');
      return number ? `Cotización ${number} emitida` : 'Cotización emitida';
    }
    case 'QUOTE_DUPLICATED':
      return 'Cotización duplicada como nuevo borrador';
    case 'QUOTE_CONVERTED': {
      const number = stringField(payload, 'invoiceNumber');
      return number ? `Cotización convertida en factura ${number}` : 'Cotización convertida';
    }
    case 'CONDUCE_ISSUED': {
      const number = stringField(payload, 'conduceNumber');
      return number ? `Conduce ${number} emitido` : 'Conduce emitido';
    }
    case 'QUOTE_CONVERTED_TO_CONDUCE': {
      const number = stringField(payload, 'conduceNumber');
      return number
        ? `Cotización convertida en conduce ${number}`
        : 'Cotización convertida en conduce';
    }
    case 'CONDUCE_INVOICED': {
      const number = stringField(payload, 'invoiceNumber');
      return number ? `Conduce facturado como ${number}` : 'Conduce facturado';
    }
    case 'INVOICE_CONFIRMED': {
      const number = stringField(payload, 'number');
      return number ? `Factura ${number} confirmada` : 'Factura confirmada';
    }
    case 'PAYMENT_RECORDED': {
      const amount = stringField(payload, 'amount') ?? '0.00';
      const currency = stringField(payload, 'currency') ?? '';
      const method = paymentMethodLabel(stringField(payload, 'method'));
      return `Pago de ${amount}${currency ? ` ${currency}` : ''} en ${method}`;
    }
    case 'INVOICE_CANCELLED':
      return 'Factura anulada';
    case 'INVOICE_GROSS_PROFIT_RECORDED':
      return 'Ganancia bruta registrada';
    case 'INVOICE_USD_FX_RECORDED':
      return fxRecordedDescription(payload);
    case 'INVOICE_USD_FX_RETRIED':
      return stringField(payload, 'outcome') === 'UNAVAILABLE'
        ? 'Reintento de tasa USD no disponible'
        : 'Tasa USD registrada';
    case 'INVOICE_PDF_GENERATED':
      return 'PDF generado';
    case 'INVOICE_PDF_FAILED':
      return 'Falló la generación del PDF';
    default:
      return null;
  }
}

export function toInvoiceHistoryEntries(
  rows: InvoiceHistoryRow[],
  role: Role,
): InvoiceHistoryEntryView[] {
  const entries: InvoiceHistoryEntryView[] = [];
  for (const row of rows) {
    if (HIDDEN_INVOICE_TIMELINE_EVENTS.has(row.eventType)) continue;
    if (ADMINISTRATOR_ONLY_EVENTS.has(row.eventType) && role !== 'ADMINISTRATOR') continue;
    const description = describeInvoiceHistoryEvent(row);
    if (!description) continue;
    entries.push({
      id: row.id,
      type: row.eventType,
      description,
      createdAt: row.occurredAt.toISOString(),
      ...(row.actor?.name ? { actorName: row.actor.name } : {}),
    });
  }
  return entries;
}
