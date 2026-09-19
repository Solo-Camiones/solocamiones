import { Prisma, type InvoiceCurrency, type InvoiceStatus } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import type { SellerSalesReportFilters, SellerSalesReportRow } from './types.js';

type SellerSalesDatabase = Pick<Prisma.TransactionClient, 'invoice'>;

type SellerSalesInvoiceRecord = {
  status: InvoiceStatus;
  number: string | null;
  quoteNumber: string | null;
  confirmedAt: Date | null;
  quoteIssuedAt: Date | null;
  confirmedByUserId: string | null;
  confirmedByName: string | null;
  quoteIssuedByUserId: string | null;
  quoteIssuedByName: string | null;
  customerName: string | null;
  currency: InvoiceCurrency;
  gross: Prisma.Decimal | null;
  customer: { name: string };
};

/** Same calendar-day bounds as invoice list filters (AST, America/Santo_Domingo). */
function businessDayRange(dateFrom: string, dateTo: string) {
  return {
    gte: new Date(`${dateFrom}T00:00:00-04:00`),
    lte: new Date(`${dateTo}T23:59:59.999-04:00`),
  };
}

function sellerSalesWhere(query: SellerSalesReportFilters): Prisma.InvoiceWhereInput {
  const range = businessDayRange(query.dateFrom, query.dateTo);
  const completed: Prisma.InvoiceWhereInput = {
    status: 'COMPLETED',
    confirmedAt: range,
    ...(query.sellerUserId ? { confirmedByUserId: query.sellerUserId } : {}),
  };
  const quoteIssued: Prisma.InvoiceWhereInput = {
    status: 'QUOTE_ISSUED',
    quoteIssuedAt: range,
    ...(query.sellerUserId ? { quoteIssuedByUserId: query.sellerUserId } : {}),
  };
  return { OR: [completed, quoteIssued] };
}

function toSellerSalesRow(invoice: SellerSalesInvoiceRecord): SellerSalesReportRow | null {
  const customerName = invoice.customerName ?? invoice.customer.name;

  if (invoice.status === 'COMPLETED') {
    if (
      !invoice.number ||
      !invoice.confirmedAt ||
      !invoice.confirmedByUserId ||
      !invoice.confirmedByName ||
      invoice.gross == null
    ) {
      return null;
    }
    return {
      documentType: 'INVOICE',
      number: invoice.number,
      documentDate: invoice.confirmedAt,
      sellerUserId: invoice.confirmedByUserId,
      sellerName: invoice.confirmedByName,
      customerName,
      currency: invoice.currency,
      gross: invoice.gross,
    };
  }

  if (invoice.status === 'QUOTE_ISSUED') {
    if (
      !invoice.quoteNumber ||
      !invoice.quoteIssuedAt ||
      !invoice.quoteIssuedByUserId ||
      !invoice.quoteIssuedByName ||
      invoice.gross == null
    ) {
      return null;
    }
    return {
      documentType: 'QUOTE',
      number: invoice.quoteNumber,
      documentDate: invoice.quoteIssuedAt,
      sellerUserId: invoice.quoteIssuedByUserId,
      sellerName: invoice.quoteIssuedByName,
      customerName,
      currency: invoice.currency,
      gross: invoice.gross,
    };
  }

  return null;
}

function compareSellerSalesRows(left: SellerSalesReportRow, right: SellerSalesReportRow): number {
  const byDate = left.documentDate.getTime() - right.documentDate.getTime();
  if (byDate !== 0) return byDate;
  const byType = left.documentType.localeCompare(right.documentType);
  if (byType !== 0) return byType;
  return left.number.localeCompare(right.number);
}

/**
 * Read-only report query. Kept out of SalesRepository so the PDF service (Hito 2)
 * can call it without growing the invoice aggregate repository.
 */
export class SellerSalesReportRepository {
  constructor(private readonly database: SellerSalesDatabase = prisma) {}

  /** All matching rows (JSON list pages slice in the service; PDF uses the full set). */
  async listAll(query: SellerSalesReportFilters) {
    const invoices = await this.database.invoice.findMany({
      where: sellerSalesWhere(query),
      select: {
        status: true,
        number: true,
        quoteNumber: true,
        confirmedAt: true,
        quoteIssuedAt: true,
        confirmedByUserId: true,
        confirmedByName: true,
        quoteIssuedByUserId: true,
        quoteIssuedByName: true,
        customerName: true,
        currency: true,
        gross: true,
        customer: { select: { name: true } },
      },
    });

    return invoices
      .flatMap((invoice) => {
        const row = toSellerSalesRow(invoice);
        return row ? [row] : [];
      })
      .sort(compareSellerSalesRows);
  }
}
