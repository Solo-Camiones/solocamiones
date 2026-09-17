import type { InvoiceLine } from '@prisma/client';

import {
  INVOICE_PDF_TEMPLATE_VERSION,
  type InvoicePdfFacts,
} from '../../infrastructure/invoice-pdf/index.js';
import type { QuotePdfFacts } from '../../infrastructure/quote-pdf/index.js';
import { formatFiscalId } from '../customers/fiscal.js';
import { formatDominicanPhone } from '../customers/phone.js';
import { MONEY_DECIMAL_PLACES } from '../sales/money/constants.js';
import type { InvoicePdfHistorySnapshot, InvoiceRecord } from '../sales/types.js';

function moneyString(value: { toFixed(places: number): string }): string {
  return value.toFixed(MONEY_DECIMAL_PLACES);
}

function persistedLineMoney(line: InvoiceLine) {
  if (line.gross == null || line.base == null || line.itbis == null) return null;
  return { gross: line.gross, base: line.base, itbis: line.itbis };
}

export function toInvoicePdfFacts(invoice: InvoiceRecord): InvoicePdfFacts | null {
  if (
    invoice.status !== 'COMPLETED' &&
    invoice.status !== 'CANCELLED'
  ) {
    return null;
  }
  if (
    invoice.number == null ||
    invoice.confirmedAt == null ||
    invoice.customerName == null ||
    invoice.gross == null ||
    invoice.base == null ||
    invoice.itbis == null ||
    invoice.dueDate == null
  ) {
    return null;
  }

  const lines: InvoicePdfFacts['lines'] = [];
  for (const line of invoice.lines) {
    // Use stored line money. Recalculating would rewrite historical invoices.
    const money = persistedLineMoney(line);
    if (money == null) return null;
    lines.push({
      description: line.description,
      notes: line.notes,
      quantity: moneyString(line.quantity),
      unitPrice: moneyString(line.unitPrice),
      base: moneyString(money.base),
      gross: moneyString(money.gross),
      itbis: moneyString(money.itbis),
    });
  }

  return {
    status: invoice.status,
    number: invoice.number,
    originQuoteNumber: invoice.quoteNumber,
    currency: invoice.currency,
    fiscal: invoice.fiscal,
    customerName: invoice.customerName,
    customerRnc: formatFiscalId(invoice.customerRnc) || null,
    customerPhone: formatDominicanPhone(invoice.customerPhone) || null,
    sellerName: invoice.confirmedByName,
    confirmedAt: invoice.confirmedAt,
    dueDate: invoice.dueDate,
    cancelledAt: invoice.cancelledAt,
    cancelReason: invoice.cancelReason,
    cancelledByName: invoice.cancelledByName,
    lines,
    totals: {
      gross: moneyString(invoice.gross),
      base: moneyString(invoice.base),
      itbis: moneyString(invoice.itbis),
    },
    // Stored pdfTemplateVersion is generation metadata. Re-downloads always use
    // the current writer so retired local labels like internal-v3 keep working
    // without a permanent relabel migration (DOC-001).
    templateVersion: INVOICE_PDF_TEMPLATE_VERSION,
  };
}

export function toQuotePdfFacts(invoice: InvoiceRecord): QuotePdfFacts | null {
  if (invoice.status !== 'QUOTE_ISSUED') return null;
  if (
    invoice.quoteNumber == null ||
    invoice.quoteIssuedAt == null ||
    invoice.quoteExpiresAt == null ||
    invoice.customerName == null ||
    invoice.gross == null ||
    invoice.base == null ||
    invoice.itbis == null
  ) {
    return null;
  }

  const lines: QuotePdfFacts['lines'] = [];
  for (const line of invoice.lines) {
    // Issued quote money is frozen on the aggregate. Recalculating would rewrite
    // the document if tax rules change after QUOTE_ISSUED.
    const money = persistedLineMoney(line);
    if (money == null) return null;
    lines.push({
      description: line.description,
      notes: line.notes,
      quantity: moneyString(line.quantity),
      unitPrice: moneyString(line.unitPrice),
      base: moneyString(money.base),
      gross: moneyString(money.gross),
      itbis: moneyString(money.itbis),
    });
  }

  return {
    status: 'QUOTE_ISSUED',
    quoteNumber: invoice.quoteNumber,
    currency: invoice.currency,
    customerName: invoice.customerName,
    customerRnc: formatFiscalId(invoice.customerRnc) || null,
    customerPhone: formatDominicanPhone(invoice.customerPhone) || null,
    sellerName: invoice.confirmedByName,
    quoteIssuedAt: invoice.quoteIssuedAt,
    quoteExpiresAt: invoice.quoteExpiresAt,
    lines,
    totals: {
      gross: moneyString(invoice.gross),
      base: moneyString(invoice.base),
      itbis: moneyString(invoice.itbis),
    },
  };
}

export function toInvoicePdfHistorySnapshot(input: {
  status: 'READY' | 'FAILED';
  errorId: string | null;
  templateVersion: string;
}): InvoicePdfHistorySnapshot {
  return {
    status: input.status,
    errorId: input.errorId,
    templateVersion: input.templateVersion,
  };
}
