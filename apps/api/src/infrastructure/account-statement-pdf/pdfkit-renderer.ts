import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

import {
  INVOICE_PDF_INTERNAL_NOTICE,
  INVOICE_PDF_ISSUER_ADDRESS,
  INVOICE_PDF_ISSUER_EMAIL,
  INVOICE_PDF_ISSUER_NAME,
  INVOICE_PDF_ISSUER_PHONES,
  INVOICE_PDF_ISSUER_RNC,
} from '../invoice-pdf/constants.js';
import { PAYMENT_STATE_LABEL } from '../invoice-pdf/pdfkit-renderer.js';
import type { AccountStatementPdfFacts, AccountStatementPdfRenderer } from './types.js';

type PdfDocument = InstanceType<typeof PDFDocument>;

const BRAND_BLUE = '#0e8fd1';
const BRAND_NAVY = '#0c1e3a';
const LIGHT_BLUE = '#eaf6fc';
const MUTED = '#526173';
const BORDER = '#d6e0e8';
const PAGE_MARGIN = 44;
const FOOTER_TOP = 730;
const ROW_HEIGHT = 28;
const LOGO_PATH = fileURLToPath(
  new URL('../../../../web/src/shared/assets/brand/SoloCamionesLogo.png', import.meta.url),
);

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(value);
}

function money(value: string): string {
  return `RD$${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function drawHeader(document: PdfDocument, continued: boolean): number {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  document.image(LOGO_PATH, left, 34, { fit: [68, 68] });
  document
    .fillColor(BRAND_NAVY)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(INVOICE_PDF_ISSUER_NAME, 122, 38);
  document.fillColor(MUTED).font('Helvetica').fontSize(7.5);
  document.text(`RNC: ${INVOICE_PDF_ISSUER_RNC}`, 122, 57);
  document.text(INVOICE_PDF_ISSUER_ADDRESS, 122, 70, { width: 270 });
  document.text(`${INVOICE_PDF_ISSUER_PHONES} | ${INVOICE_PDF_ISSUER_EMAIL}`, 122, 84, {
    width: 300,
  });
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
  document.moveTo(left, 112).lineTo(right, 112).lineWidth(2).strokeColor(BRAND_BLUE).stroke();
  return 128;
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
  document.text(`Generado: ${formatDateTime(facts.generatedAt)}`, 350, y + 18, {
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
  const range = document.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    document.switchToPage(page);
    document
      .moveTo(left, FOOTER_TOP)
      .lineTo(right, FOOTER_TOP)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    document.fillColor(MUTED).font('Helvetica').fontSize(6.8);
    document.text(INVOICE_PDF_INTERNAL_NOTICE, left, FOOTER_TOP + 8, {
      width: 260,
      lineBreak: false,
    });
    document.text(`Saldo actualizado al ${formatDateTime(generatedAt)}`, 215, FOOTER_TOP + 8, {
      width: 230,
      align: 'center',
      lineBreak: false,
    });
    document.text(`Página ${page + 1} de ${range.count}`, right - 85, FOOTER_TOP + 8, {
      width: 85,
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
    if (y + ROW_HEIGHT > FOOTER_TOP - 16) {
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
      formatDate(row.issuedAt),
      formatDate(row.dueDate),
      PAYMENT_STATE_LABEL[row.paymentState],
      money(row.invoiced),
      money(row.paid),
      money(row.balance),
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

  if (y + 92 > FOOTER_TOP) {
    document.addPage();
    y = drawHeader(document, true);
  } else {
    y += 14;
  }
  const totalsX = right - 280;
  document.roundedRect(totalsX, y, 280, 78, 6).fillAndStroke(LIGHT_BLUE, BORDER);
  const totals = [
    ['TOTAL FACTURADO', money(facts.totals.invoiced)],
    ['TOTAL ABONADO', money(facts.totals.paid)],
    ['SALDO PENDIENTE', money(facts.totals.balance)],
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
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        compress: false,
        size: 'LETTER',
        margin: PAGE_MARGIN,
        bufferPages: true,
      });
      document.info.Title = `Estado de cuenta - ${facts.customerName}`;
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      writeStatement(facts, document);
      document.end();
    });
  },
};
