import { CORPORATE_PROFILE } from '../document-profile/index.js';
import { BORDER, BRAND_BLUE, BRAND_NAVY, LIGHT_BLUE, LOGO_PATH, MUTED } from '../document-pdf/brand-tokens.js';
import {
  formatBusinessDate,
  formatBusinessDateTime,
  formatCalendarDate,
  formatMoney,
} from '../document-pdf/formatters.js';
import { renderPdfBuffer, type PdfDocument } from '../document-pdf/render-pdf-buffer.js';
import { INVOICE_PDF_INTERNAL_NOTICE } from '../invoice-pdf/constants.js';
import type { AccountStatementPdfFacts, AccountStatementPdfRenderer } from './types.js';

const PAYMENT_STATE_LABEL = {
  PENDING: 'PENDIENTE',
  PARTIALLY_PAID: 'ABONADO',
  OVERDUE: 'VENCIDA',
  PARTIALLY_PAID_OVERDUE: 'ABONADA VENCIDA',
} as const;

const PAGE_MARGIN = 44;
const FOOTER_RESERVE = 140;
const ROW_HEIGHT = 28;
const TOTALS_BOX_HEIGHT = 92;

function contentBottom(document: PdfDocument): number {
  return document.page.height - FOOTER_RESERVE;
}

function drawHeader(document: PdfDocument, continued: boolean): number {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  document.image(LOGO_PATH, left, 34, { fit: [68, 68] });
  document
    .fillColor(BRAND_NAVY)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(CORPORATE_PROFILE.legalName, 122, 38);
  document
    .fillColor(MUTED)
    .font('Helvetica-Oblique')
    .fontSize(7.5)
    .text(CORPORATE_PROFILE.tagline, 122, 54, { width: 270 });
  document.font('Helvetica').fontSize(7.5);
  document.text(`RNC: ${CORPORATE_PROFILE.rnc}`, 122, 68);
  document.text(CORPORATE_PROFILE.address, 122, 80, { width: 270 });
  document.text(`${CORPORATE_PROFILE.whatsApp} | ${CORPORATE_PROFILE.email}`, 122, 94, {
    width: 240,
  });
  document.text(
    [
      CORPORATE_PROFILE.social.instagram,
      CORPORATE_PROFILE.social.facebook,
      CORPORATE_PROFILE.social.tiktok,
    ].join('  ·  '),
    122,
    106,
    { width: 240 },
  );
  document
    .fillColor(BRAND_BLUE)
    .font('Helvetica-Bold')
    .fontSize(18)
    .text('ESTADO DE CUENTA', 370, 42, {
      width: right - 370,
      align: 'right',
    });
  if (continued) {
    document
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text('Continuación', 370, 67, {
        width: right - 370,
        align: 'right',
      });
  }
  document.moveTo(left, 126).lineTo(right, 126).lineWidth(2).strokeColor(BRAND_BLUE).stroke();
  return 142;
}

function drawCustomer(document: PdfDocument, facts: AccountStatementPdfFacts, y: number): number {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  document.roundedRect(left, y, right - left, 64, 6).fillAndStroke(LIGHT_BLUE, BORDER);
  document
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .text('CLIENTE', left + 12, y + 10);
  document
    .fillColor(BRAND_NAVY)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(facts.customerName, left + 12, y + 25, { width: 290 });
  document
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text(`RNC / Cédula: ${facts.customerRnc ?? '—'}`, left + 12, y + 44);
  document.text(`Generado: ${formatBusinessDateTime(facts.generatedAt)}`, 350, y + 18, {
    width: right - 362,
    align: 'right',
  });
  document
    .fillColor(BRAND_NAVY)
    .font('Helvetica-Bold')
    .text('Moneda: DOP', 350, y + 38, {
      width: right - 362,
      align: 'right',
    });
  return y + 80;
}

function drawTableHeader(document: PdfDocument, y: number): number {
  const left = document.page.margins.left;
  const widths = [78, 66, 66, 78, 72, 72, 80];
  const labels = ['FACTURA', 'EMITIDA', 'VENCE', 'ESTADO', 'TOTAL', 'ABONADO', 'SALDO'];
  document
    .rect(
      left,
      y,
      widths.reduce((sum, width) => sum + width, 0),
      24,
    )
    .fill(BRAND_NAVY);
  let x = left;
  labels.forEach((label, index) => {
    document
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(6.8)
      .text(label, x + 4, y + 8, {
        width: widths[index]! - 8,
        align: index < 4 ? 'left' : 'right',
      });
    x += widths[index]!;
  });
  return y + 24;
}

function drawFooter(document: PdfDocument, generatedAt: Date): void {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  const footerTop = contentBottom(document);
  const transfer = CORPORATE_PROFILE.payment.transfer;
  const range = document.bufferedPageRange();
  const rightColumnWidth = right - left - 300;

  for (let page = range.start; page < range.start + range.count; page += 1) {
    document.switchToPage(page);
    document
      .moveTo(left, footerTop)
      .lineTo(right, footerTop)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    document
      .fillColor(BRAND_NAVY)
      .font('Helvetica-Bold')
      .fontSize(6.8)
      .text('Pagos por transferencia:', left, footerTop + 8);
    document
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(6.8)
      .text(
        [
          transfer.bankName,
          transfer.accountType,
          `No. de cuenta: ${transfer.accountNumber}`,
          `A nombre de: ${transfer.accountHolder}`,
        ].join('\n'),
        left,
        footerTop + 18,
        { width: 280, lineGap: 1 },
      );
    document
      .fillColor(BRAND_NAVY)
      .font('Helvetica-Bold')
      .fontSize(6.8)
      .text(
        `Pagos con cheques a nombre de: ${CORPORATE_PROFILE.payment.chequePayee}`,
        left + 300,
        footerTop + 8,
        { width: rightColumnWidth },
      );
    document
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(6.5)
      .text(`Saldo actualizado al ${formatBusinessDateTime(generatedAt)}`, left + 300, footerTop + 32, {
        width: rightColumnWidth,
      });
    document.text(INVOICE_PDF_INTERNAL_NOTICE, left + 300, footerTop + 46, {
      width: rightColumnWidth,
    });
    document.text(`Página ${page + 1} de ${range.count}`, left + 300, footerTop + 72, {
      width: rightColumnWidth,
      align: 'right',
      lineBreak: false,
    });
  }
}

function writeStatement(facts: AccountStatementPdfFacts, document: PdfDocument): void {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  const widths = [78, 66, 66, 78, 72, 72, 80];
  let y = drawCustomer(document, facts, drawHeader(document, false));
  y = drawTableHeader(document, y);

  facts.rows.forEach((row, index) => {
    if (y + ROW_HEIGHT > contentBottom(document) - 16) {
      document.addPage();
      y = drawTableHeader(document, drawHeader(document, true));
    }
    if (index % 2 === 1) document.rect(left, y, right - left, ROW_HEIGHT).fill('#f7fafc');
    document
      .rect(left, y, right - left, ROW_HEIGHT)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    const values = [
      row.number,
      formatBusinessDate(row.issuedAt),
      formatCalendarDate(row.dueDate),
      PAYMENT_STATE_LABEL[row.paymentState],
      formatMoney(row.invoiced, 'DOP'),
      formatMoney(row.paid, 'DOP'),
      formatMoney(row.balance, 'DOP'),
    ];
    let x = left;
    values.forEach((value, column) => {
      document
        .fillColor(BRAND_NAVY)
        .font(column === 6 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(7.2)
        .text(value, x + 4, y + 10, {
          width: widths[column]! - 8,
          align: column < 4 ? 'left' : 'right',
          lineBreak: false,
        });
      x += widths[column]!;
    });
    y += ROW_HEIGHT;
  });

  if (y + TOTALS_BOX_HEIGHT > contentBottom(document)) {
    document.addPage();
    y = drawHeader(document, true);
  } else {
    y += 14;
  }
  const totalsX = right - 280;
  document.roundedRect(totalsX, y, 280, 78, 6).fillAndStroke(LIGHT_BLUE, BORDER);
  const totals = [
    ['TOTAL FACTURADO', formatMoney(facts.totals.invoiced, 'DOP')],
    ['TOTAL ABONADO', formatMoney(facts.totals.paid, 'DOP')],
    ['SALDO PENDIENTE', formatMoney(facts.totals.balance, 'DOP')],
  ];
  totals.forEach(([label, value], index) => {
    const lineY = y + 12 + index * 22;
    document
      .fillColor(index === 2 ? BRAND_NAVY : MUTED)
      .font(index === 2 ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8)
      .text(label!, totalsX + 12, lineY);
    document
      .fillColor(index === 2 ? BRAND_BLUE : BRAND_NAVY)
      .font('Helvetica-Bold')
      .fontSize(index === 2 ? 9 : 8)
      .text(value!, totalsX + 135, lineY, { width: 132, align: 'right' });
  });
  drawFooter(document, facts.generatedAt);
}

export const pdfkitAccountStatementRenderer: AccountStatementPdfRenderer = {
  render(facts) {
    return renderPdfBuffer({
      margin: PAGE_MARGIN,
      title: `Estado de cuenta - ${facts.customerName}`,
      write: (document) => writeStatement(facts, document),
    });
  },
};
