import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

import {
  INVOICE_PDF_INTERNAL_NOTICE,
  INVOICE_PDF_ISSUER_NAME,
  INVOICE_PDF_ISSUER_RNC,
  INVOICE_PDF_ISSUER_ADDRESS,
  INVOICE_PDF_ISSUER_PHONES,
  INVOICE_PDF_ISSUER_EMAIL,
  INVOICE_PDF_ISSUER_INSTAGRAM,
  INVOICE_PDF_ISSUER_FACEBOOK,
  INVOICE_PDF_THANK_YOU,
  INVOICE_PDF_NCF_FIELD,
  INVOICE_PDF_TEMPLATE_V1,
  INVOICE_PDF_TEMPLATE_V2,
  INVOICE_PDF_TEMPLATE_V3,
} from './constants.js';
import type { InvoicePdfFacts, InvoicePdfRenderer } from './types.js';

type PdfDocument = InstanceType<typeof PDFDocument>;
type TemplateWriter = (facts: InvoicePdfFacts, document: PdfDocument) => void;

const BRAND_BLUE = '#0e8fd1';
const BRAND_NAVY = '#0c1e3a';
const LIGHT_BLUE = '#eaf6fc';
const MUTED = '#526173';
const BORDER = '#d6e0e8';
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

function money(amount: string, currency: InvoicePdfFacts['currency']): string {
  const symbol = currency === 'DOP' ? 'RD$' : 'US$';
  return `${symbol}${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const PAYMENT_STATE_LABEL: Record<InvoicePdfFacts['paymentState'], string> = {
  PENDING: 'PENDIENTE',
  OVERDUE: 'VENCIDA',
  PAID: 'PAGADA',
  PAID_LATE: 'PAGADA CON RETRASO',
  CANCELLED: 'CANCELADA',
};

const CONTACT_ICON_VIEWBOX = 16;
const CONTACT_ICON_SIZE = 14;
type IconFillRule = 'even-odd' | 'nonzero';

// Bootstrap Icons (MIT). Drawn in brand blue at one size, without extra disks:
// WhatsApp/Instagram/Facebook already include their badge, and nesting them
// inside a 12pt circle made the WhatsApp handset unreadable.
const CONTACT_ICON_PATHS = {
  location:
    'M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10m0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6',
  whatsapp:
    'M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232',
  mail: 'M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414zM0 4.697v7.104l5.803-3.558zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586zm3.436-.586L16 11.801V4.697z',
  instagram:
    'M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92s.546-.453.92-.598c.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334',
  facebook:
    'M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951',
} as const;

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

function drawLocationIcon(document: PdfDocument, x: number, y: number): void {
  drawContactGlyph(document, CONTACT_ICON_PATHS.location, x, y);
}

function drawWhatsAppIcon(document: PdfDocument, x: number, y: number): void {
  drawContactGlyph(document, CONTACT_ICON_PATHS.whatsapp, x, y);
}

function drawMailIcon(document: PdfDocument, x: number, y: number): void {
  drawContactGlyph(document, CONTACT_ICON_PATHS.mail, x, y, 'nonzero');
}

function drawInstagramIcon(document: PdfDocument, x: number, y: number): void {
  drawContactGlyph(document, CONTACT_ICON_PATHS.instagram, x, y);
}

function drawFacebookIcon(document: PdfDocument, x: number, y: number): void {
  drawContactGlyph(document, CONTACT_ICON_PATHS.facebook, x, y);
}

function contactRow(
  document: PdfDocument,
  icon: (document: PdfDocument, x: number, y: number) => void,
  value: string,
  x: number,
  y: number,
  width: number,
): void {
  icon(document, x, y);
  document
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(7.5)
    .text(value, x + 16, y + 2.5, {
      width,
      lineBreak: false,
    });
}

function drawV3Header(facts: InvoicePdfFacts, document: PdfDocument): number {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  document.image(LOGO_PATH, left, 36, { fit: [78, 78], align: 'center', valign: 'center' });
  document
    .fillColor(BRAND_NAVY)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(INVOICE_PDF_ISSUER_NAME, 132, 39);
  document
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text(`RNC: ${INVOICE_PDF_ISSUER_RNC}`, 132, 58);
  contactRow(document, drawLocationIcon, INVOICE_PDF_ISSUER_ADDRESS, 132, 70, 250);
  contactRow(document, drawWhatsAppIcon, INVOICE_PDF_ISSUER_PHONES, 132, 86, 250);
  contactRow(document, drawMailIcon, INVOICE_PDF_ISSUER_EMAIL, 132, 102, 250);
  contactRow(document, drawInstagramIcon, INVOICE_PDF_ISSUER_INSTAGRAM, 132, 118, 108);
  contactRow(document, drawFacebookIcon, INVOICE_PDF_ISSUER_FACEBOOK, 256, 118, 130);

  document
    .fillColor(BRAND_BLUE)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text('FACTURA', 405, 42, {
      width: right - 405,
      align: 'right',
    });
  document
    .fillColor(BRAND_NAVY)
    .fontSize(12)
    .text(facts.number, 405, 67, {
      width: right - 405,
      align: 'right',
    });
  document
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text(INVOICE_PDF_NCF_FIELD, 390, 88, {
      width: right - 390,
      align: 'right',
    });
  document
    .roundedRect(405, 106, right - 405, 22, 4)
    .fill(facts.status === 'CANCELLED' ? '#b42318' : BRAND_NAVY);
  document
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(PAYMENT_STATE_LABEL[facts.paymentState], 405, 113, {
      width: right - 405,
      align: 'center',
    });
  document.moveTo(left, 142).lineTo(right, 142).lineWidth(2).strokeColor(BRAND_BLUE).stroke();
  return 158;
}

function drawTableHeader(document: PdfDocument, y: number): number {
  const x = document.page.margins.left;
  const widths = [230, 55, 85, 70, 84];
  const labels = ['DESCRIPCIÓN', 'CANT.', 'PRECIO', 'ITBIS', 'TOTAL'];
  document
    .rect(
      x,
      y,
      widths.reduce((sum, width) => sum + width, 0),
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
        width: widths[index]! - 10,
        align: index === 0 ? 'left' : 'right',
      });
    columnX += widths[index]!;
  });
  return y + 24;
}

function writeInternalV3Document(facts: InvoicePdfFacts, document: PdfDocument): void {
  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  let y = drawV3Header(facts, document);

  if (facts.status === 'CANCELLED') {
    document.save();
    document.opacity(0.08).fillColor('#b42318').font('Helvetica-Bold').fontSize(66);
    document
      .rotate(-32, { origin: [306, 390] })
      .text('CANCELADA', 105, 350, { width: 420, align: 'center' });
    document.restore();
  }

  document.roundedRect(left, y, 322, 92, 6).fillAndStroke(LIGHT_BLUE, BORDER);
  document
    .fillColor(BRAND_NAVY)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('FACTURAR A', left + 12, y + 11);
  document.fontSize(11).text(facts.customerName, left + 12, y + 28, { width: 295 });
  document
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text(`RNC / Cédula: ${facts.customerRnc ?? ''}`, left + 12, y + 49);
  document.text(`Teléfono: ${facts.customerPhone ?? ''}`, left + 12, y + 65);

  const metaX = left + 338;
  document
    .roundedRect(metaX, y, right - metaX, 92, 6)
    .strokeColor(BORDER)
    .stroke();
  const metadata = [
    ['Emitida', formatDateTime(facts.confirmedAt)],
    ['Vencimiento', formatDate(facts.dueDate)],
    ['Moneda', facts.currency],
    ['Vendedor', facts.sellerName ?? ''],
  ];
  metadata.forEach(([label, value], index) => {
    const lineY = y + 10 + index * 19;
    document
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8.5)
      .text(label!, metaX + 10, lineY);
    document
      .fillColor(BRAND_NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(value!, metaX + 78, lineY, {
        width: right - metaX - 88,
        align: 'right',
      });
  });

  y += 108;
  y = drawTableHeader(document, y);
  const widths = [230, 55, 85, 70, 84];
  facts.lines.forEach((line, index) => {
    document.font('Helvetica').fontSize(8.5);
    const descriptionHeight = document.heightOfString(line.description, { width: widths[0]! - 12 });
    const notesHeight = line.notes
      ? document.fontSize(7.5).heightOfString(line.notes, { width: widths[0]! - 22 }) + 4
      : 0;
    const rowHeight = Math.max(30, descriptionHeight + notesHeight + 13);
    if (y + rowHeight > document.page.height - 118) {
      document.addPage();
      document
        .fillColor(BRAND_NAVY)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(`${facts.number} - continuación`, left, 42);
      y = drawTableHeader(document, 62);
    }
    if (index % 2 === 1) document.rect(left, y, right - left, rowHeight).fill('#f7fafc');
    document
      .rect(left, y, right - left, rowHeight)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    let columnX = left;
    const values = [
      line.description,
      line.quantity,
      // PRECIO is the already-rounded line base, not the tax-inclusive unit price.
      money(line.base, facts.currency),
      money(line.itbis, facts.currency),
      money(line.gross, facts.currency),
    ];
    values.forEach((value, column) => {
      document
        .fillColor(BRAND_NAVY)
        .font(column === 4 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .text(value, columnX + 6, y + 8, {
          width: widths[column]! - 12,
          align: column === 0 ? 'left' : 'right',
        });
      columnX += widths[column]!;
    });
    if (line.notes) {
      document
        .fillColor(MUTED)
        .font('Helvetica-Oblique')
        .fontSize(7.5)
        .text(line.notes, left + 12, y + descriptionHeight + 10, {
          width: widths[0]! - 22,
        });
    }
    y += rowHeight;
  });

  if (y + 190 > document.page.height - 55) {
    document.addPage();
    y = 55;
  } else {
    y += 14;
  }
  const totalsX = right - 225;
  document.roundedRect(totalsX, y, 225, 104, 6).fillAndStroke(LIGHT_BLUE, BORDER);
  const totals = [
    ['Base', money(facts.totals.base, facts.currency)],
    ['ITBIS incluido', money(facts.totals.itbis, facts.currency)],
    ['TOTAL', money(facts.totals.gross, facts.currency)],
    ['SALDO PENDIENTE', money(facts.balance, facts.currency)],
  ];
  totals.forEach(([label, value], index) => {
    const totalY = y + 13 + index * 22;
    document
      .fillColor(index >= 2 ? BRAND_NAVY : MUTED)
      .font(index >= 2 ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(index >= 2 ? 9 : 8)
      .text(label!, totalsX + 12, totalY);
    document
      .fillColor(index === 3 ? BRAND_BLUE : BRAND_NAVY)
      .font('Helvetica-Bold')
      .text(value!, totalsX + 105, totalY, {
        width: 108,
        align: 'right',
      });
  });

  if (facts.status === 'CANCELLED') {
    document
      .fillColor('#b42318')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(
        `Cancelada: ${facts.cancelledAt ? formatDateTime(facts.cancelledAt) : ''} | Administrador: ${facts.cancelledByName ?? ''}`,
        left,
        y + 8,
        { width: 280 },
      );
    document
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(`Motivo: ${facts.cancelReason ?? ''}`, left, y + 29, {
        width: 280,
        height: 58,
      });
  }

  y += 124;
  document
    .fillColor(BRAND_NAVY)
    .font('Helvetica-Oblique')
    .fontSize(8)
    .text(INVOICE_PDF_THANK_YOU, left, y, {
      width: right - left,
      align: 'center',
    });
  y += 35;
  document
    .moveTo(left + 35, y)
    .lineTo(left + 210, y)
    .strokeColor(MUTED)
    .lineWidth(0.7)
    .stroke();
  document
    .moveTo(right - 210, y)
    .lineTo(right - 35, y)
    .stroke();
  document
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(7.5)
    .text('Entregado por / Vendedor', left + 35, y + 6, { width: 175, align: 'center' });
  document.text('Recibido conforme / Cliente', right - 210, y + 6, { width: 175, align: 'center' });

  const range = document.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    document.switchToPage(page);
    const footerY = document.page.height - 52;
    document
      .moveTo(left, footerY - 7)
      .lineTo(right, footerY - 7)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    document
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(6.8)
      .text(INVOICE_PDF_INTERNAL_NOTICE, left, footerY, { width: 300, lineBreak: false });
    document.text(
      `Saldo actualizado al ${formatDateTime(facts.generatedAt)}`,
      left + 215,
      footerY,
      { width: 220, align: 'center', lineBreak: false },
    );
    document.text(`Página ${page + 1} de ${range.count}`, right - 85, footerY, {
      width: 85,
      align: 'right',
      lineBreak: false,
    });
  }
}

function writeInternalV1Document(facts: InvoicePdfFacts, document: PdfDocument): void {
  document.fontSize(16).text(INVOICE_PDF_ISSUER_NAME);
  document.fontSize(9).text(INVOICE_PDF_INTERNAL_NOTICE);
  document.moveDown();
  document.fontSize(12).text(facts.number);
  document.fontSize(11).text(INVOICE_PDF_NCF_FIELD);
  document.moveDown();
  document.fontSize(10).text(`Cliente: ${facts.customerName}`);
  document.text(`Identificación fiscal / cédula: ${facts.customerRnc ?? '—'}`);
  document.text(`Moneda: ${facts.currency}`);
  document.text(
    facts.fiscal
      ? 'Factura con comprobante fiscal (impuesto ITBIS 18% incluido)'
      : 'Sin comprobante fiscal',
  );
  document.moveDown();

  for (const line of facts.lines) {
    document.text(
      `${line.description}  ${line.quantity} x ${line.unitPrice}  ${line.gross}  ITBIS ${line.itbis}`,
    );
  }

  document.moveDown();
  document.text(`Base: ${facts.totals.base}`);
  document.text(`ITBIS: ${facts.totals.itbis}`);
  document.fontSize(12).text(`Total: ${facts.totals.gross} ${facts.currency}`);
}

function writeInternalV2Document(facts: InvoicePdfFacts, document: PdfDocument): void {
  document.fontSize(16).text(INVOICE_PDF_ISSUER_NAME);
  document.fontSize(9).text(INVOICE_PDF_INTERNAL_NOTICE);
  document.moveDown();
  document.fontSize(12).text(facts.number);
  document.fontSize(11).text(INVOICE_PDF_NCF_FIELD);
  document.moveDown();
  document.fontSize(10).text(`Cliente: ${facts.customerName}`);
  document.text(`Identificación fiscal / cédula: ${facts.customerRnc ?? '—'}`);
  document.text(`Moneda: ${facts.currency}`);
  document.text(
    facts.fiscal
      ? 'Factura con comprobante fiscal (impuesto ITBIS 18% incluido)'
      : 'Sin comprobante fiscal',
  );
  document.moveDown();

  for (const line of facts.lines) {
    document
      .fontSize(10)
      .text(
        `${line.description}  ${line.quantity} x ${line.unitPrice}  ${line.gross}  ITBIS ${line.itbis}`,
      );
    if (line.notes) {
      document.fontSize(8).fillColor('#555555').text(line.notes, { indent: 12 });
      document.fillColor('#000000');
    }
  }

  document.moveDown();
  document.fontSize(10).text(`Base: ${facts.totals.base}`);
  document.text(`ITBIS: ${facts.totals.itbis}`);
  document.fontSize(12).text(`Total: ${facts.totals.gross} ${facts.currency}`);
}

// Keep prior writers immutable so persisted invoices always use their original template.
const TEMPLATE_WRITERS: Readonly<Record<string, TemplateWriter>> = {
  [INVOICE_PDF_TEMPLATE_V1]: writeInternalV1Document,
  [INVOICE_PDF_TEMPLATE_V2]: writeInternalV2Document,
  [INVOICE_PDF_TEMPLATE_V3]: writeInternalV3Document,
};

export const pdfkitInvoicePdfRenderer: InvoicePdfRenderer = {
  render(facts) {
    const writeTemplate = TEMPLATE_WRITERS[facts.templateVersion];
    if (!writeTemplate) {
      return Promise.reject(
        new Error(`Unsupported invoice PDF template version: ${facts.templateVersion}`),
      );
    }
    return new Promise((resolve, reject) => {
      // Uncompressed streams keep FAC- and the blank NCF field as extractable literals for tests.
      const document = new PDFDocument({
        compress: false,
        size: 'LETTER',
        margin: facts.templateVersion === INVOICE_PDF_TEMPLATE_V3 ? 44 : 50,
        bufferPages: facts.templateVersion === INVOICE_PDF_TEMPLATE_V3,
      });
      document.info.Title = facts.number;
      document.info.Subject = INVOICE_PDF_NCF_FIELD;
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      writeTemplate(facts, document);
      document.end();
    });
  },
};
