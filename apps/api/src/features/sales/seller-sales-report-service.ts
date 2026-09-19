import { Prisma, type InvoiceCurrency } from '@prisma/client';



import {

  pdfkitSellerSalesRenderer,

  type SellerSalesPdfRenderer,

} from '../../infrastructure/seller-sales-pdf/index.js';

import { assertAdministrator } from '../users/policies.js';

import { moneyString } from '../payments/receivables.js';

import { SellerSalesReportRepository } from './seller-sales-report-repository.js';

import { salesTransaction, type SalesTransaction } from './transaction.js';

import type {

  PublicSellerSalesReport,

  SellerSalesReportFilters,

  SellerSalesReportQuery,

  SellerSalesReportRow,

} from './types.js';



const DOCUMENT_TYPE_LABEL = {

  INVOICE: 'Factura',

  QUOTE: 'Cotización',

} as const;



function formatDocumentDate(value: Date): string {

  return new Intl.DateTimeFormat('es-DO', {

    timeZone: 'America/Santo_Domingo',

    day: '2-digit',

    month: '2-digit',

    year: 'numeric',

  }).format(value);

}



function formatMoney(amount: string, currency: InvoiceCurrency): string {

  const symbol = currency === 'DOP' ? 'RD$' : 'US$';

  return `${symbol}${Number(amount).toLocaleString('en-US', {

    minimumFractionDigits: 2,

    maximumFractionDigits: 2,

  })}`;

}



function filenameDatePart(isoDate: string): string {

  return isoDate.replaceAll('-', '');

}



type SellerCurrencyTotal = {

  sellerUserId: string;

  sellerName: string;

  currency: InvoiceCurrency;

  gross: Prisma.Decimal;

};



function aggregateTotals(rows: SellerSalesReportRow[]): SellerCurrencyTotal[] {

  const byKey = new Map<string, SellerCurrencyTotal>();

  for (const row of rows) {

    const key = `${row.sellerUserId}:${row.currency}`;

    const existing = byKey.get(key);

    if (existing) {

      existing.gross = existing.gross.plus(row.gross);

      continue;

    }

    byKey.set(key, {

      sellerUserId: row.sellerUserId,

      sellerName: row.sellerName,

      currency: row.currency,

      gross: row.gross,

    });

  }

  return [...byKey.values()].sort((left, right) => {

    const bySeller = left.sellerName.localeCompare(right.sellerName, 'es');

    if (bySeller !== 0) return bySeller;

    return left.currency.localeCompare(right.currency);

  });

}



function toPublicReport(

  query: SellerSalesReportQuery,

  pageRows: SellerSalesReportRow[],

  allRows: SellerSalesReportRow[],

  total: number,

): PublicSellerSalesReport {

  // Totals cover the full filtered range; rows are the current list page.

  const totals = aggregateTotals(allRows);

  return {

    dateFrom: query.dateFrom,

    dateTo: query.dateTo,

    sellerUserId: query.sellerUserId ?? null,

    rows: pageRows.map((row) => ({

      documentType: row.documentType,

      number: row.number,

      documentDate: row.documentDate.toISOString(),

      sellerUserId: row.sellerUserId,

      sellerName: row.sellerName,

      customerName: row.customerName,

      currency: row.currency,

      gross: moneyString(row.gross),

    })),

    totals: totals.map((totalRow) => ({

      sellerUserId: totalRow.sellerUserId,

      sellerName: totalRow.sellerName,

      currency: totalRow.currency,

      gross: moneyString(totalRow.gross),

    })),

    total,

    page: query.page,

    pageSize: query.pageSize,

  };

}



export class SellerSalesReportService {

  constructor(

    private readonly transaction: SalesTransaction = salesTransaction,

    private readonly reportRepository: SellerSalesReportRepository = new SellerSalesReportRepository(),

    private readonly renderer: SellerSalesPdfRenderer = pdfkitSellerSalesRenderer,

  ) {}



  private async assertAdministratorActor(actorId: string) {

    await this.transaction(async ({ users }) => {

      assertAdministrator(await users.findById(actorId));

    });

  }



  async query(actorId: string, query: SellerSalesReportQuery): Promise<PublicSellerSalesReport> {

    await this.assertAdministratorActor(actorId);

    const allRows = await this.reportRepository.listAll(query);

    const start = (query.page - 1) * query.pageSize;

    const pageRows = allRows.slice(start, start + query.pageSize);

    return toPublicReport(query, pageRows, allRows, allRows.length);

  }



  async download(actorId: string, query: SellerSalesReportFilters) {

    await this.assertAdministratorActor(actorId);

    const generatedAt = new Date();

    const rows = await this.reportRepository.listAll(query);

    const sellerFilterName =

      query.sellerUserId && rows.length > 0 ? (rows[0]?.sellerName ?? null) : null;

    const totals = aggregateTotals(rows);

    const body = await this.renderer.render({

      dateFrom: query.dateFrom,

      dateTo: query.dateTo,

      generatedAt,

      sellerFilterName,

      rows: rows.map((row) => ({

        documentTypeLabel: DOCUMENT_TYPE_LABEL[row.documentType],

        number: row.number,

        documentDateLabel: formatDocumentDate(row.documentDate),

        sellerName: row.sellerName,

        customerName: row.customerName,

        currency: row.currency,

        grossLabel: formatMoney(moneyString(row.gross), row.currency),

      })),

      totals: totals.map((total) => ({

        sellerName: total.sellerName,

        currency: total.currency,

        grossLabel: formatMoney(moneyString(total.gross), total.currency),

      })),

    });



    return {

      filename: `ventas-vendedores-${filenameDatePart(query.dateFrom)}-${filenameDatePart(query.dateTo)}.pdf`,

      contentType: 'application/pdf',

      body,

    };

  }

}


