import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { CORPORATE_PROFILE } from '../../../src/infrastructure/document-profile/index.js';
import { pdfkitAccountStatementRenderer } from '../../../src/infrastructure/account-statement-pdf/index.js';
import {
  INVOICE_PDF_NCF_FIELD,
  INVOICE_PDF_TEMPLATE_V4,
  pdfkitInvoicePdfRenderer,
} from '../../../src/infrastructure/invoice-pdf/index.js';
import { pdfkitQuotePdfRenderer } from '../../../src/infrastructure/quote-pdf/index.js';
import type { InvoicePdfFacts } from '../../../src/infrastructure/invoice-pdf/types.js';
import type { QuotePdfFacts } from '../../../src/infrastructure/quote-pdf/types.js';
import {
  isPngBuffer,
  PDF_VISUAL_REVIEW_ROOT,
  reviewPdfDocument,
} from '../../helpers/pdf-document-review.js';

const INVOICE_COLLECTION_STRINGS = [
  'SALDO PENDIENTE',
  'Saldo actualizado al',
  'PENDIENTE',
  'ABONADO',
] as const;

const APPROVED_PROFILE_STRINGS = [
  CORPORATE_PROFILE.legalName,
  '809-875-3161',
  '829-627-3168',
  CORPORATE_PROFILE.email,
  'Av. Pdte.',
  CORPORATE_PROFILE.social.instagram,
  CORPORATE_PROFILE.social.facebook,
  CORPORATE_PROFILE.social.tiktok,
  CORPORATE_PROFILE.payment.transfer.bankName,
  CORPORATE_PROFILE.payment.transfer.accountType,
  CORPORATE_PROFILE.payment.transfer.accountNumber,
  `Pagos con cheques a nombre de: ${CORPORATE_PROFILE.payment.chequePayee}`,
] as const;

const RETIRED_CONTACT_STRINGS = ['809-212-7751', 'jmvargas24@gmail.com', 'Av. Pte.'] as const;

const invoiceBase: InvoicePdfFacts = {
  status: 'COMPLETED',
  number: 'FAC-000101',
  originQuoteNumber: null,
  currency: 'DOP',
  fiscal: false,
  customerName: 'Cliente contado',
  customerRnc: null,
  customerPhone: '809-555-0101',
  sellerName: 'María Pérez',
  confirmedAt: new Date('2026-09-08T18:00:00.000Z'),
  dueDate: new Date('2026-10-08T00:00:00.000Z'),
  cancelledAt: null,
  cancelReason: null,
  cancelledByName: null,
  lines: [
    {
      description: 'Filtro de aceite',
      notes: null,
      quantity: '1.00',
      unitPrice: '118.00',
      base: '118.00',
      gross: '118.00',
      itbis: '0.00',
    },
  ],
  totals: { gross: '118.00', base: '118.00', itbis: '0.00' },
  templateVersion: INVOICE_PDF_TEMPLATE_V4,
};

const quoteBase: QuotePdfFacts = {
  status: 'QUOTE_ISSUED',
  quoteNumber: 'COT-000201',
  currency: 'DOP',
  customerName: 'Transportes del Este',
  customerRnc: '1-01-11111-1',
  customerPhone: '809-555-0101',
  sellerName: 'María Pérez',
  quoteIssuedAt: new Date('2026-09-15T18:00:00.000Z'),
  quoteExpiresAt: new Date('2026-10-16T16:00:00.000Z'),
  lines: [
    {
      description: 'Filtro de aceite',
      notes: null,
      quantity: '1.00',
      unitPrice: '100.00',
      base: '100.00',
      gross: '118.00',
      itbis: '18.00',
    },
  ],
  totals: { gross: '118.00', base: '100.00', itbis: '18.00' },
};

function expectApprovedFooter(text: string): void {
  for (const value of APPROVED_PROFILE_STRINGS) {
    expect(text).toContain(value);
  }
  for (const value of RETIRED_CONTACT_STRINGS) {
    expect(text).not.toContain(value);
  }
}

function expectInvoiceOmitsCollectionData(text: string): void {
  for (const value of INVOICE_COLLECTION_STRINGS) {
    expect(text).not.toContain(value);
  }
}

function expectSharedLayoutMarkers(text: string): void {
  expect(text).toContain('Página');
  expect(text).toContain('Entregado por / Vendedor');
  expect(text).toContain('Recibido conforme / Cliente');
}

async function expectRasterizedPages(imagePaths: string[]): Promise<void> {
  expect(imagePaths.length).toBeGreaterThan(0);
  for (const imagePath of imagePaths) {
    const png = await readFile(imagePath);
    expect(isPngBuffer(png)).toBe(true);
    expect(png.byteLength).toBeGreaterThan(8_000);
  }
}

describe('document visual review (DOC-001 / Paso 9 fase 14)', () => {
  it('extracts real text and rasterizes a short invoice without ITBIS', async () => {
    const pdf = await pdfkitInvoicePdfRenderer.render(invoiceBase);
    const reviewed = await reviewPdfDocument(pdf, path.join(PDF_VISUAL_REVIEW_ROOT, 'invoice-short-no-itbis'));

    expect(reviewed.fullText.length).toBeGreaterThan(80);
    expect(reviewed.fullText).toContain('FACTURA');
    expect(reviewed.fullText).toContain('FAC-000101');
    expect(reviewed.fullText).toContain(INVOICE_PDF_NCF_FIELD);
    expect(reviewed.fullText).toContain('Filtro de aceite');
    expect(reviewed.fullText).toContain('0.00');
    expect(reviewed.fullText).not.toContain('COT-');
    expectApprovedFooter(reviewed.fullText);
    expectInvoiceOmitsCollectionData(reviewed.fullText);
    expectSharedLayoutMarkers(reviewed.fullText);
    await expectRasterizedPages(reviewed.imagePaths);
  });

  it('extracts real text and rasterizes an invoice with ITBIS', async () => {
    const pdf = await pdfkitInvoicePdfRenderer.render({
      ...invoiceBase,
      number: 'FAC-000102',
      fiscal: true,
      lines: [
        {
          description: 'Bomba de agua',
          notes: null,
          quantity: '2.00',
          unitPrice: '118.00',
          base: '200.00',
          gross: '236.00',
          itbis: '36.00',
        },
      ],
      totals: { gross: '236.00', base: '200.00', itbis: '36.00' },
    });
    const reviewed = await reviewPdfDocument(pdf, path.join(PDF_VISUAL_REVIEW_ROOT, 'invoice-with-itbis'));

    expect(reviewed.fullText).toContain('FAC-000102');
    expect(reviewed.fullText).toContain('ITBIS');
    expect(reviewed.fullText).toContain('36.00');
    expect(reviewed.fullText).toContain('236.00');
    expectInvoiceOmitsCollectionData(reviewed.fullText);
    await expectRasterizedPages(reviewed.imagePaths);
  });

  it('extracts real text and rasterizes an invoice that originated from a quote', async () => {
    const pdf = await pdfkitInvoicePdfRenderer.render({
      ...invoiceBase,
      number: 'FAC-000103',
      originQuoteNumber: 'COT-000201',
    });
    const reviewed = await reviewPdfDocument(pdf, path.join(PDF_VISUAL_REVIEW_ROOT, 'invoice-from-quote'));

    expect(reviewed.fullText).toContain('FAC-000103');
    expect(reviewed.fullText).toContain('COT-000201');
    expectInvoiceOmitsCollectionData(reviewed.fullText);
    await expectRasterizedPages(reviewed.imagePaths);
  });

  it('extracts real text and rasterizes a cancelled invoice', async () => {
    const pdf = await pdfkitInvoicePdfRenderer.render({
      ...invoiceBase,
      number: 'FAC-000104',
      status: 'CANCELLED',
      cancelledAt: new Date('2026-09-09T18:00:00.000Z'),
      cancelReason: 'Solicitud del cliente',
      cancelledByName: 'Ana Administradora',
    });
    const reviewed = await reviewPdfDocument(pdf, path.join(PDF_VISUAL_REVIEW_ROOT, 'invoice-cancelled'));

    expect(reviewed.fullText).toContain('CANCELADA');
    expect(reviewed.fullText).toContain('Solicitud del cliente');
    expect(reviewed.fullText).toContain('Ana Administradora');
    expectInvoiceOmitsCollectionData(reviewed.fullText);
    await expectRasterizedPages(reviewed.imagePaths);
  });

  it('extracts real text and rasterizes a many-line invoice across pages', async () => {
    const pdf = await pdfkitInvoicePdfRenderer.render({
      ...invoiceBase,
      number: 'FAC-000105',
      lines: Array.from({ length: 28 }, (_, index) => ({
        ...invoiceBase.lines[0]!,
        description: `Repuesto ${index + 1}`,
      })),
    });
    const reviewed = await reviewPdfDocument(pdf, path.join(PDF_VISUAL_REVIEW_ROOT, 'invoice-many-lines'));

    expect(reviewed.pageCount).toBeGreaterThan(1);
    expect(reviewed.fullText).toContain('Repuesto 1');
    expect(reviewed.fullText).toContain('Repuesto 28');
    expect(reviewed.fullText).toContain('continuación');
    expect(reviewed.pages[0]).toContain('Página 1 de');
    expect(reviewed.pages.at(-1)).toContain(`Página ${reviewed.pageCount} de`);
    expectApprovedFooter(reviewed.fullText);
    expectInvoiceOmitsCollectionData(reviewed.fullText);
    await expectRasterizedPages(reviewed.imagePaths);
  });

  it('extracts real text and rasterizes multiline line notes without dropping the footer', async () => {
    const notes = [
      'Instalar junto con el kit de empaques.',
      'Verificar torque del fabricante.',
      'No mezclar con el lote anterior del mismo proveedor.',
    ].join('\n');
    const pdf = await pdfkitInvoicePdfRenderer.render({
      ...invoiceBase,
      number: 'FAC-000106',
      lines: [
        {
          ...invoiceBase.lines[0]!,
          description: 'Kit de bomba de agua',
          notes,
        },
      ],
    });
    const reviewed = await reviewPdfDocument(pdf, path.join(PDF_VISUAL_REVIEW_ROOT, 'invoice-multiline-notes'));

    expect(reviewed.fullText).toContain('Kit de bomba de agua');
    expect(reviewed.fullText).toContain('Instalar junto con el kit de empaques.');
    expect(reviewed.fullText).toContain('Verificar torque del fabricante.');
    expectApprovedFooter(reviewed.fullText);
    await expectRasterizedPages(reviewed.imagePaths);
  });

  it('extracts real text and rasterizes a current issued quote', async () => {
    const pdf = await pdfkitQuotePdfRenderer.render(quoteBase);
    const reviewed = await reviewPdfDocument(pdf, path.join(PDF_VISUAL_REVIEW_ROOT, 'quote-current'));

    expect(reviewed.fullText).toContain('COTIZACIÓN');
    expect(reviewed.fullText).toContain('COT-000201');
    expect(reviewed.fullText).toContain('Vigente hasta');
    expect(reviewed.fullText).toContain('16/10/2026');
    expect(reviewed.fullText).not.toContain('NO ES FACTURA');
    expect(reviewed.fullText).not.toContain('FAC-');
    expect(reviewed.fullText).not.toContain('NCF:');
    expectInvoiceOmitsCollectionData(reviewed.fullText);
    expectApprovedFooter(reviewed.fullText);
    expectSharedLayoutMarkers(reviewed.fullText);
    await expectRasterizedPages(reviewed.imagePaths);
  });

  it('extracts real text and rasterizes an expired issued quote', async () => {
    const pdf = await pdfkitQuotePdfRenderer.render({
      ...quoteBase,
      quoteNumber: 'COT-000202',
      quoteIssuedAt: new Date('2026-07-01T18:00:00.000Z'),
      quoteExpiresAt: new Date('2026-08-01T16:00:00.000Z'),
    });
    const reviewed = await reviewPdfDocument(pdf, path.join(PDF_VISUAL_REVIEW_ROOT, 'quote-expired'));

    expect(reviewed.fullText).toContain('COTIZACIÓN');
    expect(reviewed.fullText).toContain('COT-000202');
    expect(reviewed.fullText).toContain('01/08/2026');
    expect(reviewed.fullText).not.toContain('FAC-');
    expectInvoiceOmitsCollectionData(reviewed.fullText);
    await expectRasterizedPages(reviewed.imagePaths);
  });

  it('extracts real text and rasterizes a multi-page account statement with balances', async () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      number: `FAC-${String(index + 1).padStart(6, '0')}`,
      issuedAt: new Date('2026-09-01T14:00:00.000Z'),
      dueDate: new Date('2026-10-01T00:00:00.000Z'),
      paymentState: index === 0 ? ('PARTIALLY_PAID' as const) : ('PENDING' as const),
      invoiced: '1000.00',
      paid: index === 0 ? '400.00' : '0.00',
      balance: index === 0 ? '600.00' : '1000.00',
    }));
    const pdf = await pdfkitAccountStatementRenderer.render({
      customerName: 'Transportes del Caribe SRL',
      customerRnc: '131234567',
      generatedAt: new Date('2026-09-16T15:30:00.000Z'),
      rows,
      totals: {
        invoiced: '60000.00',
        paid: '400.00',
        balance: '59600.00',
      },
    });
    const reviewed = await reviewPdfDocument(pdf, path.join(PDF_VISUAL_REVIEW_ROOT, 'statement-multipage'));

    expect(reviewed.pageCount).toBeGreaterThan(1);
    expect(reviewed.fullText).toContain('ESTADO DE CUENTA');
    expect(reviewed.fullText).toContain('FAC-000001');
    expect(reviewed.fullText).toContain('FAC-000060');
    expect(reviewed.fullText).toContain('PENDIENTE');
    expect(reviewed.fullText).toContain('ABONADO');
    expect(reviewed.fullText).toContain('SALDO PENDIENTE');
    expect(reviewed.fullText).toContain('Saldo actualizado al');
    expect(reviewed.fullText).not.toContain('TRANSFER');
    expect(reviewed.fullText).not.toContain('CHECK');
    expectApprovedFooter(reviewed.fullText);
    expect(reviewed.pages[0]).toContain('Página 1 de');
    await expectRasterizedPages(reviewed.imagePaths);
  });
});
