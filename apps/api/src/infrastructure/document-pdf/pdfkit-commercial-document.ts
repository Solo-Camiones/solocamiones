import { Prisma } from '@prisma/client';

import { CORPORATE_PROFILE } from '../document-profile/index.js';
import { BORDER, BRAND_BLUE, BRAND_NAVY, LIGHT_BLUE, LOGO_PATH, MUTED } from './brand-tokens.js';
import {
  COMMERCIAL_DOCUMENT_TERMS,
  COMMERCIAL_DOCUMENT_TERMS_TITLE,
} from './constants.js';
import {
  formatBusinessDate,
  formatBusinessDateTime,
  formatCalendarDate,
  formatMoney,
} from './formatters.js';
import { renderPdfBuffer, type PdfDocument } from './render-pdf-buffer.js';

export type { PdfDocument };

type Currency = 'DOP' | 'USD';

type CommercialLineFacts = {
  description: string;
  notes: string | null;
  quantity: string;
  base: string;
  itbis: string;
  gross: string;
};

export type CommercialDocumentFacts = {
  number: string;
  currency: Currency;
  customerName: string;
  customerRnc: string | null;
  customerPhone: string | null;
  sellerName: string | null;
  issuedAt: Date;
  secondaryDate: Date;
  /** Invoice-only: "Al contado" / "A crédito". Quotes omit this. */
  saleCondition?: string;
  lines: readonly CommercialLineFacts[];
  totals: {
    base: string;
    itbis: string;
    gross: string;
    discount: string;
    /** Applied commercial percent (0–100), shown in the Descuento label. */
    discountPercent: string;
  };
  originQuoteNumber?: string | null;
  cancellation?: {
    cancelledAt: Date | null;
    reason: string | null;
    cancelledByName: string | null;
  };
};

export type CommercialDocumentOptions = {
  title: string;
  subject: string;
  customerLabel: string;
  secondaryDateLabel: string;
  /**
   * Invoice dueDate is `@db.Date` (UTC midnight). Formatting it in America/Santo_Domingo
   * shifts the calendar day back by one. Quote expiry is a real local instant — leave false.
   */
  secondaryDateAsCalendarDate?: boolean;
  thankYou: string;
  ncfField?: string;
  contactLayout: {
    gap: number;
    leftWidth: number;
    rowHeight: number;
  };
};

export const COMMERCIAL_DOCUMENT_CONTACT_LAYOUT = {
  invoice: { gap: 10, leftWidth: 148, rowHeight: 16 },
  quote: { gap: 12, leftWidth: 123, rowHeight: 16 },
} as const;

const FOOTER_RESERVE = 138;
const TOTALS_AND_SIGNATURES_HEIGHT = 230;
const TOTALS_BOX_WIDTH = 225;
const TOTALS_ROW_HEIGHT = 22;
const TOTALS_BOX_PADDING_Y = 13;
const TABLE_WIDTHS = [230, 55, 85, 70, 84] as const;
const HEADER_CONTACT_X = 132;
const HEADER_CONTACT_WIDTH = 258;
const HEADER_NAME_Y = 36;
const HEADER_TAGLINE_Y = 51;
const HEADER_RNC_Y = 65;
const HEADER_ADDRESS_Y = 78;
const HEADER_CONTENT_PADDING = 14;
const CONTACT_ICON_VIEWBOX = 16;
const CONTACT_ICON_SIZE = 14;
const CUSTOMER_META_BOX_HEIGHT = 108;
const PAGE_MARGIN = 44;

type IconFillRule = 'even-odd' | 'nonzero';

// Bootstrap Icons (MIT). Paths keep the contact header sharp in every PDF.
const CONTACT_ICON_PATHS = {
  location: 'M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10m0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6',
  whatsapp:
    'M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232',
  mail: 'M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414zM0 4.697v7.104l5.803-3.558zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586zm3.436-.586L16 11.801V4.697z',
  instagram:
    'M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92s.546-.453.92-.598c.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334',
  facebook:
    'M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951',
  tiktok:
    'M9 0h1.98c.144.715.54 1.617 1.235 2.512C12.895 3.389 13.797 4 15 4v2c-1.753 0-3.07-.814-4-1.829V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z',
} as const;

/** Strip trailing zeros so PDF shows Descuento(10%) / Descuento(10.5%), not Descuento(10.00%). */
function formatDiscountPercentLabel(percent: string): string {
  const parsed = Number(percent);
  const normalized = Number.isFinite(parsed) ? parsed : 0;
  return String(parseFloat(normalized.toFixed(2)));
}

function addMoneyStrings(left: string, right: string): string {
  return new Prisma.Decimal(left).plus(right).toFixed(2);
}

function contentBottom(document: PdfDocument): number {
  return document.page.height - FOOTER_RESERVE;
}

function drawContactGlyph(
  document: PdfDocument,
  path: string,
  x: number,
  y: number,
  fillRule: IconFillRule = 'even-odd',
): void {
  document.save();
  document.translate(x, y);
  document.scale(CONTACT_ICON_SIZE / CONTACT_ICON_VIEWBOX);
  document.fillColor(BRAND_BLUE).path(path).fill(fillRule);
  document.restore();
}

function contactRow(
  document: PdfDocument,
  iconPath: string,
  value: string,
  x: number,
  y: number,
  width: number,
  fillRule: IconFillRule = 'even-odd',
): void {
  drawContactGlyph(document, iconPath, x, y, fillRule);
  document
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(7.5)
    .text(value, x + 16, y + 2.5, { width, lineBreak: false });
}

function drawHeader(
  document: PdfDocument,
  facts: CommercialDocumentFacts,
  options: CommercialDocumentOptions,
): number {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  const rightColumnWidth =
    HEADER_CONTACT_WIDTH - options.contactLayout.leftWidth - options.contactLayout.gap;
  const rightColumnX =
    HEADER_CONTACT_X + options.contactLayout.leftWidth + options.contactLayout.gap;
  // Address + WhatsApp/mail/instagram share one vertical rhythm so spacing looks even.
  const rowY = (row: number) => HEADER_ADDRESS_Y + row * options.contactLayout.rowHeight;

  document.image(LOGO_PATH, left, 36, { fit: [78, 78], align: 'center', valign: 'center' });
  document
    .fillColor(BRAND_NAVY)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(CORPORATE_PROFILE.legalName, HEADER_CONTACT_X, HEADER_NAME_Y);
  document
    .fillColor(MUTED)
    .font('Helvetica-Oblique')
    .fontSize(8)
    .text(CORPORATE_PROFILE.tagline, HEADER_CONTACT_X, HEADER_TAGLINE_Y, {
      width: HEADER_CONTACT_WIDTH,
      lineBreak: false,
    });
  document
    .font('Helvetica')
    .fontSize(8)
    .text(`RNC: ${CORPORATE_PROFILE.rnc}`, HEADER_CONTACT_X, HEADER_RNC_Y);
  contactRow(
    document,
    CONTACT_ICON_PATHS.location,
    CORPORATE_PROFILE.address,
    HEADER_CONTACT_X,
    rowY(0),
    HEADER_CONTACT_WIDTH,
  );
  contactRow(
    document,
    CONTACT_ICON_PATHS.whatsapp,
    CORPORATE_PROFILE.whatsApp,
    HEADER_CONTACT_X,
    rowY(1),
    options.contactLayout.leftWidth,
  );
  contactRow(
    document,
    CONTACT_ICON_PATHS.mail,
    CORPORATE_PROFILE.email,
    HEADER_CONTACT_X,
    rowY(2),
    options.contactLayout.leftWidth,
    'nonzero',
  );
  contactRow(
    document,
    CONTACT_ICON_PATHS.instagram,
    CORPORATE_PROFILE.social.instagram,
    HEADER_CONTACT_X,
    rowY(3),
    options.contactLayout.leftWidth,
  );
  contactRow(
    document,
    CONTACT_ICON_PATHS.facebook,
    CORPORATE_PROFILE.social.facebook,
    rightColumnX,
    rowY(1),
    rightColumnWidth,
  );
  contactRow(
    document,
    CONTACT_ICON_PATHS.tiktok,
    CORPORATE_PROFILE.social.tiktok,
    rightColumnX,
    rowY(2),
    rightColumnWidth,
    'nonzero',
  );

  document
    .fillColor(BRAND_BLUE)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(options.title, 405, 42, { width: right - 405, align: 'right' });
  document
    .fillColor(BRAND_NAVY)
    .fontSize(12)
    .text(facts.number, 405, 67, { width: right - 405, align: 'right' });
  if (options.ncfField) {
    document
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(options.ncfField, 390, 88, { width: right - 390, align: 'right' });
  }
  if (facts.originQuoteNumber) {
    document.text(facts.originQuoteNumber, 405, 102, { width: right - 405, align: 'right' });
  }
  if (facts.cancellation) {
    document.roundedRect(405, 116, right - 405, 22, 4).fill('#b42318');
    document
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('CANCELADA', 405, 123, { width: right - 405, align: 'center' });
  }
  const separatorY = rowY(4) + 6;
  document
    .moveTo(left, separatorY)
    .lineTo(right, separatorY)
    .lineWidth(2)
    .strokeColor(BRAND_BLUE)
    .stroke();
  return separatorY + HEADER_CONTENT_PADDING;
}

function drawTableHeader(document: PdfDocument, y: number): number {
  const x = document.page.margins.left;
  const labels = ['DESCRIPCIÓN', 'CANT.', 'PRECIO', 'ITBIS', 'TOTAL'];
  document
    .rect(
      x,
      y,
      TABLE_WIDTHS.reduce((sum, width) => sum + width, 0),
      24,
    )
    .fill(BRAND_NAVY);
  let columnX = x;
  labels.forEach((label, index) => {
    document
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(label, columnX + 5, y + 8, {
        width: TABLE_WIDTHS[index]! - 10,
        align: index === 0 ? 'left' : 'right',
      });
    columnX += TABLE_WIDTHS[index]!;
  });
  return y + 24;
}

function drawFooter(
  document: PdfDocument,
  page: number,
  pageCount: number,
): void {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  const footerTop = contentBottom(document);
  const transfer = CORPORATE_PROFILE.payment.transfer;
  const rightColumnWidth = right - left - 300;
  document
    .moveTo(left, footerTop)
    .lineTo(right, footerTop)
    .strokeColor(BORDER)
    .lineWidth(0.5)
    .stroke();
  // No identity / social / contact strip in the footer — only payment instructions and terms.
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
    .fillColor(BRAND_NAVY)
    .font('Helvetica-Bold')
    .fontSize(6.5)
    .text(COMMERCIAL_DOCUMENT_TERMS_TITLE, left + 300, footerTop + 26, {
      width: rightColumnWidth,
    });
  document
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(6)
    .text(
      COMMERCIAL_DOCUMENT_TERMS.map((term) => `• ${term}`).join('\n'),
      left + 300,
      footerTop + 36,
      { width: rightColumnWidth, lineGap: 1 },
    );
  document.text(`Página ${page} de ${pageCount}`, left + 300, footerTop + 84, {
    width: rightColumnWidth,
    align: 'right',
    lineBreak: false,
  });
}

function drawCustomerAndMetadata(
  document: PdfDocument,
  facts: CommercialDocumentFacts,
  options: CommercialDocumentOptions,
  y: number,
): number {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  document.roundedRect(left, y, 322, CUSTOMER_META_BOX_HEIGHT, 6).fillAndStroke(LIGHT_BLUE, BORDER);
  document
    .fillColor(BRAND_NAVY)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(options.customerLabel, left + 12, y + 11);
  document.fontSize(11).text(facts.customerName, left + 12, y + 28, { width: 295 });
  document
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text(`RNC / Cédula: ${facts.customerRnc ?? ''}`, left + 12, y + 49);
  document.text(`Teléfono: ${facts.customerPhone ?? ''}`, left + 12, y + 65);
  const metaX = left + 338;
  document
    .roundedRect(metaX, y, right - metaX, CUSTOMER_META_BOX_HEIGHT, 6)
    .strokeColor(BORDER)
    .stroke();
  const secondaryDate = options.secondaryDateAsCalendarDate
    ? formatCalendarDate(facts.secondaryDate)
    : formatBusinessDate(facts.secondaryDate);
  const metadata: Array<[string, string]> = [
    ['Emitida', formatBusinessDateTime(facts.issuedAt)],
    [options.secondaryDateLabel, secondaryDate],
    ['Moneda', facts.currency],
  ];
  if (facts.saleCondition) {
    metadata.push(['Condición', facts.saleCondition]);
  }
  metadata.push(['Vendedor', facts.sellerName ?? '']);
  const rowGap = facts.saleCondition ? 17 : 19;
  metadata.forEach(([label, value], index) => {
    const lineY = y + 10 + index * rowGap;
    document
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8.5)
      .text(label, metaX + 10, lineY);
    document
      .fillColor(BRAND_NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(value, metaX + 78, lineY, { width: right - metaX - 88, align: 'right' });
  });
  return y + CUSTOMER_META_BOX_HEIGHT + 16;
}

function drawLines(document: PdfDocument, facts: CommercialDocumentFacts, y: number): number {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  let currentY = drawTableHeader(document, y);
  facts.lines.forEach((line, index) => {
    document.font('Helvetica').fontSize(8.5);
    const descriptionHeight = document.heightOfString(line.description, {
      width: TABLE_WIDTHS[0] - 12,
    });
    const notesHeight = line.notes
      ? document.fontSize(7.5).heightOfString(line.notes, { width: TABLE_WIDTHS[0] - 22 }) + 4
      : 0;
    const rowHeight = Math.max(30, descriptionHeight + notesHeight + 13);
    if (currentY + rowHeight > contentBottom(document) - 8) {
      document.addPage();
      document
        .fillColor(BRAND_NAVY)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(`${facts.number} - continuación`, left, 42);
      currentY = drawTableHeader(document, 62);
    }
    if (index % 2 === 1) document.rect(left, currentY, right - left, rowHeight).fill('#f7fafc');
    document
      .rect(left, currentY, right - left, rowHeight)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    const values = [
      line.description,
      line.quantity,
      // The price column is the already-rounded line base, not a tax-inclusive unit price.
      formatMoney(line.base, facts.currency),
      formatMoney(line.itbis, facts.currency),
      formatMoney(line.gross, facts.currency),
    ];
    let columnX = left;
    values.forEach((value, column) => {
      document
        .fillColor(BRAND_NAVY)
        .font(column === 4 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .text(value, columnX + 6, currentY + 8, {
          width: TABLE_WIDTHS[column]! - 12,
          align: column === 0 ? 'left' : 'right',
        });
      columnX += TABLE_WIDTHS[column]!;
    });
    if (line.notes) {
      document
        .fillColor(MUTED)
        .font('Helvetica-Oblique')
        .fontSize(7.5)
        .text(line.notes, left + 12, currentY + descriptionHeight + 10, {
          width: TABLE_WIDTHS[0] - 22,
        });
    }
    currentY += rowHeight;
  });
  return currentY;
}

function drawTotalsAndSignatures(
  document: PdfDocument,
  facts: CommercialDocumentFacts,
  options: CommercialDocumentOptions,
  y: number,
): void {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  let currentY = y;
  if (currentY + TOTALS_AND_SIGNATURES_HEIGHT > contentBottom(document)) {
    document.addPage();
    currentY = 55;
  } else currentY += 14;
  const totalsX = right - TOTALS_BOX_WIDTH;
  // Match POS: Subtotal is pre-discount bases; Descuento is always printed (including 0%).
  const subtotalAmount = addMoneyStrings(facts.totals.base, facts.totals.discount);
  const discountLabel = `Descuento(${formatDiscountPercentLabel(facts.totals.discountPercent)}%)`;
  const totals: Array<[string, string, boolean]> = [
    ['Subtotal', formatMoney(subtotalAmount, facts.currency), false],
    // Helvetica (WinAnsi) has no Unicode minus − (U+2212); it renders as garbage (").
    [discountLabel, `-${formatMoney(facts.totals.discount, facts.currency)}`, false],
    ['ITBIS', formatMoney(facts.totals.itbis, facts.currency), false],
    ['TOTAL', formatMoney(facts.totals.gross, facts.currency), true],
  ];
  const totalsBoxHeight = TOTALS_BOX_PADDING_Y * 2 + totals.length * TOTALS_ROW_HEIGHT - 8;
  document
    .roundedRect(totalsX, currentY, TOTALS_BOX_WIDTH, totalsBoxHeight, 6)
    .fillAndStroke(LIGHT_BLUE, BORDER);
  totals.forEach(([label, value, emphasize], index) => {
    const totalY = currentY + TOTALS_BOX_PADDING_Y + index * TOTALS_ROW_HEIGHT;
    document
      .fillColor(emphasize ? BRAND_NAVY : MUTED)
      .font(emphasize ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(emphasize ? 9 : 8)
      .text(label, totalsX + 12, totalY);
    document
      .fillColor(BRAND_NAVY)
      .font('Helvetica-Bold')
      .text(value, totalsX + 105, totalY, { width: 108, align: 'right' });
  });
  if (facts.cancellation) {
    document
      .fillColor('#b42318')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(
        `Cancelada: ${facts.cancellation.cancelledAt ? formatBusinessDateTime(facts.cancellation.cancelledAt) : ''} | Administrador: ${facts.cancellation.cancelledByName ?? ''}`,
        left,
        currentY + 8,
        { width: 280 },
      );
    document
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(`Motivo: ${facts.cancellation.reason ?? ''}`, left, currentY + 29, {
        width: 280,
        height: 58,
      });
  }
  currentY += 124;
  document
    .fillColor(BRAND_NAVY)
    .font('Helvetica-Oblique')
    .fontSize(8)
    .text(options.thankYou, left, currentY, { width: right - left, align: 'center' });
  currentY += 35;
  document
    .moveTo(left + 35, currentY)
    .lineTo(left + 210, currentY)
    .strokeColor(MUTED)
    .lineWidth(0.7)
    .stroke();
  document
    .moveTo(right - 210, currentY)
    .lineTo(right - 35, currentY)
    .stroke();
  document
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(7.5)
    .text('Entregado por / Vendedor', left + 35, currentY + 6, { width: 175, align: 'center' });
  document.text('Recibido conforme / Cliente', right - 210, currentY + 6, {
    width: 175,
    align: 'center',
  });
}

function writeDocument(
  document: PdfDocument,
  facts: CommercialDocumentFacts,
  options: CommercialDocumentOptions,
): void {
  let y = drawHeader(document, facts, options);
  if (facts.cancellation) {
    document.save();
    document.opacity(0.08).fillColor('#b42318').font('Helvetica-Bold').fontSize(66);
    document
      .rotate(-32, { origin: [306, 390] })
      .text('CANCELADA', 105, 350, { width: 420, align: 'center' });
    document.restore();
  }
  y = drawCustomerAndMetadata(document, facts, options, y);
  y = drawLines(document, facts, y);
  drawTotalsAndSignatures(document, facts, options, y);
  const range = document.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    document.switchToPage(page);
    drawFooter(document, page + 1, range.count);
  }
}

export function renderCommercialDocument(
  facts: CommercialDocumentFacts,
  options: CommercialDocumentOptions,
): Promise<Buffer> {
  return renderPdfBuffer({
    margin: PAGE_MARGIN,
    title: facts.number,
    subject: options.subject,
    write: (document) => writeDocument(document, facts, options),
  });
}
