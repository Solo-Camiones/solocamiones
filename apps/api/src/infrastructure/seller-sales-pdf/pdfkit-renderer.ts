import { CORPORATE_PROFILE } from '../document-profile/index.js';
import { BORDER, BRAND_BLUE, BRAND_NAVY, LIGHT_BLUE, LOGO_PATH, MUTED } from '../document-pdf/brand-tokens.js';
import { formatBusinessDateTime, formatCalendarDate } from '../document-pdf/formatters.js';
import { renderPdfBuffer, type PdfDocument } from '../document-pdf/render-pdf-buffer.js';
import { SELLER_SALES_PDF_EMPTY_MESSAGE } from './constants.js';
import type { SellerSalesPdfFacts, SellerSalesPdfRenderer } from './types.js';

const PAGE_MARGIN = 36;
const FOOTER_RESERVE = 56;
const ROW_HEIGHT = 22;
const HEADER_ROW_HEIGHT = 22;

/** Column widths for LETTER portrait (content ≈ 540pt with 36pt margins). */
const COLUMN_WIDTHS = [46, 66, 66, 52, 78, 96, 36, 72] as const;
const COLUMN_LABELS = [
  'TIPO',
  'NÚMERO',
  'ORIGEN',
  'FECHA',
  'VENDEDOR',
  'CLIENTE',
  'MONEDA',
  'MONTO',
] as const;

/** Report filter bounds are ISO calendar dates (`YYYY-MM-DD`), not instants. */
function formatIsoDate(value: string): string {
  return formatCalendarDate(new Date(`${value}T00:00:00.000Z`));
}

function contentBottom(document: PdfDocument): number {
  return document.page.height - FOOTER_RESERVE;
}

function tableWidth(): number {
  return COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0);
}

function drawHeader(document: PdfDocument, continued: boolean): number {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  document.image(LOGO_PATH, left, 28, { fit: [60, 60] });
  document
    .fillColor(BRAND_NAVY)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(CORPORATE_PROFILE.legalName, 110, 32);
  document
    .fillColor(MUTED)
    .font('Helvetica-Oblique')
    .fontSize(7)
    .text(CORPORATE_PROFILE.tagline, 110, 48, { width: 250 });
  document.font('Helvetica').fontSize(7);
  document.text(`RNC: ${CORPORATE_PROFILE.rnc}`, 110, 62);
  document.text(CORPORATE_PROFILE.address, 110, 74, { width: 250 });
  document
    .fillColor(BRAND_BLUE)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text('VENTAS POR VENDEDOR', 360, 36, {
      width: right - 360,
      align: 'right',
    });
  if (continued) {
    document
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text('Continuación', 360, 58, {
        width: right - 360,
        align: 'right',
      });
  }
  document.moveTo(left, 104).lineTo(right, 104).lineWidth(2).strokeColor(BRAND_BLUE).stroke();
  return 118;
}

function drawMeta(document: PdfDocument, facts: SellerSalesPdfFacts, y: number): number {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  const boxHeight = facts.sellerFilterName ? 52 : 40;
  document.roundedRect(left, y, right - left, boxHeight, 6).fillAndStroke(LIGHT_BLUE, BORDER);
  document
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text(
      `Período: ${formatIsoDate(facts.dateFrom)} – ${formatIsoDate(facts.dateTo)}`,
      left + 12,
      y + 10,
    );
  document.text(`Generado: ${formatBusinessDateTime(facts.generatedAt)}`, 340, y + 10, {
    width: right - 352,
    align: 'right',
  });
  if (facts.sellerFilterName) {
    document
      .fillColor(BRAND_NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(`Vendedor: ${facts.sellerFilterName}`, left + 12, y + 28);
  }
  return y + boxHeight + 12;
}

function drawTableHeader(document: PdfDocument, y: number): number {
  const left = document.page.margins.left;
  document.rect(left, y, tableWidth(), HEADER_ROW_HEIGHT).fill(BRAND_NAVY);
  let x = left;
  COLUMN_LABELS.forEach((label, index) => {
    const align = index >= 6 ? 'right' : 'left';
    document
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text(label, x + 3, y + 7, {
        width: COLUMN_WIDTHS[index]! - 6,
        align,
        lineBreak: false,
      });
    x += COLUMN_WIDTHS[index]!;
  });
  return y + HEADER_ROW_HEIGHT;
}

function drawEmptyMessage(document: PdfDocument, y: number): void {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  document
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(10)
    .text(SELLER_SALES_PDF_EMPTY_MESSAGE, left, y + 24, {
      width: right - left,
      align: 'center',
    });
}

function drawFooter(document: PdfDocument, generatedAt: Date): void {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  const footerTop = contentBottom(document);
  const range = document.bufferedPageRange();

  for (let page = range.start; page < range.start + range.count; page += 1) {
    document.switchToPage(page);
    document
      .moveTo(left, footerTop)
      .lineTo(right, footerTop)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    document
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7)
      .text(`Generado: ${formatBusinessDateTime(generatedAt)}`, left, footerTop + 10, {
        width: 280,
      });
    document.text(`Página ${page + 1} de ${range.count}`, left + 280, footerTop + 10, {
      width: right - left - 280,
      align: 'right',
      lineBreak: false,
    });
  }
}

function drawTotals(document: PdfDocument, facts: SellerSalesPdfFacts, startY: number): void {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  let y = startY;

  document
    .fillColor(BRAND_NAVY)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('Totales por vendedor', left, y);
  y += 16;

  const boxWidth = Math.min(320, right - left);
  const boxX = right - boxWidth;
  const lineHeight = 16;
  const boxHeight = 28 + facts.totals.length * lineHeight;

  if (y + boxHeight > contentBottom(document)) {
    document.addPage();
    y = drawHeader(document, true) + 8;
  }

  document.roundedRect(boxX, y, boxWidth, boxHeight, 6).fillAndStroke(LIGHT_BLUE, BORDER);
  document
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(7)
    .text('VENDEDOR', boxX + 10, y + 8, { width: 140 });
  document.text('MONEDA', boxX + 150, y + 8, { width: 50 });
  document.text('TOTAL', boxX + 200, y + 8, { width: boxWidth - 210, align: 'right' });

  facts.totals.forEach((total, index) => {
    const lineY = y + 24 + index * lineHeight;
    document
      .fillColor(BRAND_NAVY)
      .font('Helvetica')
      .fontSize(7.5)
      .text(total.sellerName, boxX + 10, lineY, { width: 140, lineBreak: false });
    document.text(total.currency, boxX + 150, lineY, { width: 50, lineBreak: false });
    document
      .font('Helvetica-Bold')
      .text(total.grossLabel, boxX + 200, lineY, {
        width: boxWidth - 210,
        align: 'right',
        lineBreak: false,
      });
  });
}

function writeReport(facts: SellerSalesPdfFacts, document: PdfDocument): void {
  const left = document.page.margins.left;
  let y = drawMeta(document, facts, drawHeader(document, false));

  if (facts.rows.length === 0) {
    drawEmptyMessage(document, y);
    drawFooter(document, facts.generatedAt);
    return;
  }

  y = drawTableHeader(document, y);

  facts.rows.forEach((row, index) => {
    if (y + ROW_HEIGHT > contentBottom(document) - 8) {
      document.addPage();
      y = drawTableHeader(document, drawHeader(document, true));
    }
    if (index % 2 === 1) {
      document.rect(left, y, tableWidth(), ROW_HEIGHT).fill('#f7fafc');
    }
    document
      .rect(left, y, tableWidth(), ROW_HEIGHT)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();

    const values = [
      row.documentTypeLabel,
      row.number,
      row.originNumber ?? '—',
      row.documentDateLabel,
      row.sellerName,
      row.customerName,
      row.currency,
      row.grossLabel,
    ];
    let x = left;
    values.forEach((value, column) => {
      document
        .fillColor(BRAND_NAVY)
        .font(column === 7 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(6.8)
        .text(value, x + 3, y + 7, {
          width: COLUMN_WIDTHS[column]! - 6,
          align: column >= 6 ? 'right' : 'left',
          lineBreak: false,
        });
      x += COLUMN_WIDTHS[column]!;
    });
    y += ROW_HEIGHT;
  });

  y += 14;
  drawTotals(document, facts, y);
  drawFooter(document, facts.generatedAt);
}

export const pdfkitSellerSalesRenderer: SellerSalesPdfRenderer = {
  render(facts) {
    return renderPdfBuffer({
      margin: PAGE_MARGIN,
      title: `Ventas por vendedor ${facts.dateFrom} – ${facts.dateTo}`,
      write: (document) => writeReport(facts, document),
    });
  },
};
