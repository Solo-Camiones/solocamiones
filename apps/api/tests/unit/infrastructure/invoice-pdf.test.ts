import { describe, expect, it } from 'vitest';

import {
  INVOICE_PDF_NCF_FIELD,
  pdfkitInvoicePdfRenderer,
} from '../../../src/infrastructure/invoice-pdf/index.js';

const facts = {
  status: 'COMPLETED' as const,
  number: 'FAC-000001',
  originQuoteNumber: null,
  currency: 'DOP' as const,
  fiscal: false,
  customerName: 'Cliente contado',
  customerRnc: null,
  customerPhone: null,
  sellerName: 'María Pérez',
  confirmedAt: new Date('2026-09-08T18:00:00.000Z'),
  dueDate: new Date('2026-10-08T00:00:00.000Z'),
  cancelledAt: null,
  cancelReason: null,
  cancelledByName: null,
  lines: [
    {
      description: 'Filtro',
      notes: null,
      quantity: '1.00',
      unitPrice: '118.00',
      base: '118.00',
      gross: '118.00',
      itbis: '0.00',
    },
  ],
  totals: { gross: '118.00', base: '118.00', itbis: '0.00' },
  templateVersion: 'internal-v4',
};

function pdfHexText(pdf: Buffer): string {
  return [...pdf.toString('latin1').matchAll(/\[(.*?)\]\s*TJ/gs)]
    .flatMap((operation) => [...operation[1].matchAll(/<([0-9a-f]+)>/gi)])
    .map((operand) => operand[1])
    .join('');
}

describe('invoice PDF renderer (SALE-004)', () => {
  it('embeds FAC- number, one currency, two-decimal totals, and a blank NCF field', async () => {
    const pdf = await pdfkitInvoicePdfRenderer.render(facts);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const text = pdf.toString('latin1');
    expect(text).toContain('(FAC-000001)');
    expect(text).toContain(`(${INVOICE_PDF_NCF_FIELD})`);
    expect(text).toContain('444f50');
    expect(text).toContain('3131382e3030');
    expect(text).not.toContain('e-CF');
  });

  it('prints optional line notes below the description', async () => {
    const pdf = await pdfkitInvoicePdfRenderer.render({
      ...facts,
      lines: [
        {
          ...facts.lines[0],
          notes: 'Installed water pump',
        },
      ],
    });
    const text = pdf.toString('latin1');
    expect(text).toContain('46696c74726f');
    expect(text).toContain('496e7374616c6c6564');
  });

  it('rejects an unsupported persisted template version instead of changing the document', async () => {
    await expect(
      pdfkitInvoicePdfRenderer.render({ ...facts, templateVersion: 'internal-unknown' }),
    ).rejects.toThrow('Unsupported invoice PDF template version: internal-unknown');
  });

  it('rejects retired template versions instead of rendering them', async () => {
    await expect(
      pdfkitInvoicePdfRenderer.render({ ...facts, templateVersion: 'internal-v3' }),
    ).rejects.toThrow('Unsupported invoice PDF template version: internal-v3');
  });

  it('prints line base in PRECIO, not the tax-inclusive unit price', async () => {
    const pdf = await pdfkitInvoicePdfRenderer.render({
      ...facts,
      fiscal: true,
      lines: [
        {
          description: 'Filtro',
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
    const text = pdf.toString('latin1');
    expect(text).toContain('3230302e3030');
    expect(text).toContain('33362e3030');
    expect(text).toContain('3233362e3030');
    expect(text).not.toContain('3131382e3030');
  });

  it('prints cancelled facts without payment state, balance, or balance timestamp', async () => {
    const pdf = await pdfkitInvoicePdfRenderer.render({
      ...facts,
      status: 'CANCELLED',
      cancelledAt: new Date('2026-09-09T18:00:00.000Z'),
      cancelReason: 'Solicitud del cliente',
      cancelledByName: 'Ana Administradora',
    });
    const text = pdf.toString('latin1');
    const hexText = pdfHexText(pdf);
    expect(text.slice(0, 5)).toBe('%PDF-');
    expect(text).toContain('(FAC-000001)');
    expect(text).toContain(`(${INVOICE_PDF_NCF_FIELD})`);
    expect(hexText).toContain(Buffer.from('CANCELADA').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('SALDO PENDIENTE').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('Saldo actualizado al').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('PENDIENTE').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('ABONADO').toString('hex'));
    expect(text).not.toContain('(DIR)');
    expect(text).not.toContain('(WA)');
    expect(text).not.toContain('(MAIL)');
  });

  it('prints origin COT- only when the invoice came from a quote', async () => {
    const withOrigin = await pdfkitInvoicePdfRenderer.render({
      ...facts,
      originQuoteNumber: 'COT-000012',
    });
    const withoutOrigin = await pdfkitInvoicePdfRenderer.render(facts);

    const withHex = pdfHexText(withOrigin);
    const withoutHex = pdfHexText(withoutOrigin);
    expect(withHex).toContain(Buffer.from('COT-000012').toString('hex'));
    expect(withoutHex).not.toContain(Buffer.from('COT-').toString('hex'));
  });

  it('prints the approved corporate profile, TikTok, and payment footer without collection data', async () => {
    const pdf = await pdfkitInvoicePdfRenderer.render(facts);
    const hexText = pdfHexText(pdf);

    expect(hexText).toContain(Buffer.from('FACTURA').toString('hex'));
    expect(hexText).toContain(Buffer.from('SOLO CAMIONES').toString('hex'));
    expect(hexText).toContain(Buffer.from('809-875-3161').toString('hex'));
    expect(hexText).toContain(Buffer.from('829-627-3168').toString('hex'));
    expect(hexText).toContain(Buffer.from('solocamionessrl@gmail.com').toString('hex'));
    expect(hexText).toContain(Buffer.from('Av. Pdte.').toString('hex'));
    expect(hexText).toContain(Buffer.from('@solocamionessrl').toString('hex'));
    expect(hexText).toContain(Buffer.from('solo.camiones.srl').toString('hex'));
    expect(hexText).toContain(Buffer.from('Pagos por transferencia:').toString('hex'));
    expect(hexText).toContain(Buffer.from('Banco Popular Dominicano').toString('hex'));
    expect(hexText).toContain(Buffer.from('Cuenta Corriente DOP').toString('hex'));
    expect(hexText).toContain(Buffer.from('857578579').toString('hex'));
    expect(hexText).toContain(Buffer.from('Solo Camiones SRL').toString('hex'));
    expect(hexText).toContain(Buffer.from('Pagos con cheques a nombre de:').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('809-212-7751').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('jmvargas24@gmail.com').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('Av. Pte.').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('e-CF').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('SALDO PENDIENTE').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('Saldo actualizado al').toString('hex'));
  });

  it('keeps the payment footer when the invoice paginates', async () => {
    const pdf = await pdfkitInvoicePdfRenderer.render({
      ...facts,
      lines: Array.from({ length: 28 }, (_, index) => ({
        ...facts.lines[0],
        description: `Repuesto ${index + 1}`,
        notes: 'Nota larga que no debe tapar la fila siguiente ni el pie de pagina.',
      })),
    });
    const hexText = pdfHexText(pdf);
    expect(hexText).toContain(Buffer.from('continuación', 'latin1').toString('hex'));
    expect(hexText).toContain(Buffer.from('Pagos por transferencia:').toString('hex'));
    expect(hexText).toContain(Buffer.from('857578579').toString('hex'));
  });
});
