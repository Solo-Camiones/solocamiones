import { describe, expect, it } from 'vitest';

import {
  pdfkitQuotePdfRenderer,
  quotePdfFilename,
} from '../../../src/infrastructure/quote-pdf/index.js';

const facts = {
  status: 'QUOTE_ISSUED' as const,
  quoteNumber: 'COT-000007',
  currency: 'DOP' as const,
  customerName: 'Transportes del Este',
  customerRnc: '1-01-11111-1',
  customerPhone: '809-555-0101',
  sellerName: 'María Pérez',
  quoteIssuedAt: new Date('2026-09-15T18:00:00.000Z'),
  quoteExpiresAt: new Date('2026-10-16T03:59:59.000Z'),
  lines: [
    {
      description: 'Filtro',
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

function pdfHexText(pdf: Buffer): string {
  return [...pdf.toString('latin1').matchAll(/\[(.*?)\]\s*TJ/gs)]
    .flatMap((operation) => [...operation[1].matchAll(/<([0-9a-f]+)>/gi)])
    .map((operand) => operand[1])
    .join('');
}

describe('quote PDF renderer (QUOTE-002 / DOC-001)', () => {
  it('names the download COT-xxxxxx.pdf', () => {
    expect(quotePdfFilename(facts.quoteNumber)).toBe('COT-000007.pdf');
  });

  it('prints COTIZACIÓN with COT- number, frozen customer, lines, and totals', async () => {
    const pdf = await pdfkitQuotePdfRenderer.render(facts);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const hexText = pdfHexText(pdf);
    expect(hexText).toContain(Buffer.from('COTIZACIÓN', 'latin1').toString('hex'));
    expect(hexText).toContain(Buffer.from('COT-000007').toString('hex'));
    expect(hexText).toContain(Buffer.from('Transportes del Este').toString('hex'));
    expect(hexText).toContain(Buffer.from('1-01-11111-1').toString('hex'));
    expect(hexText).toContain(Buffer.from('Filtro').toString('hex'));
    expect(hexText).toContain(Buffer.from('Vigente hasta').toString('hex'));
    expect(hexText).toContain(Buffer.from('Subtotal').toString('hex'));
    expect(hexText).toContain(Buffer.from('ITBIS').toString('hex'));
    expect(hexText).toContain(Buffer.from('TOTAL').toString('hex'));
    expect(pdf.toString('latin1')).toContain('3131382e3030');
  });

  it('omits invoice labels, payment state, and the NO ES FACTURA phrase', async () => {
    const pdf = await pdfkitQuotePdfRenderer.render(facts);
    const hexText = pdfHexText(pdf);
    expect(hexText).not.toContain(Buffer.from('NO ES FACTURA').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('FACTURA').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('FAC-').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('NCF:').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('SALDO PENDIENTE').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('Saldo actualizado al').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('PENDIENTE').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('ABONADO').toString('hex'));
  });

  it('prints the approved corporate profile and payment footer', async () => {
    const pdf = await pdfkitQuotePdfRenderer.render(facts);
    const hexText = pdfHexText(pdf);
    expect(hexText).toContain(Buffer.from('SOLO CAMIONES').toString('hex'));
    expect(hexText).toContain(Buffer.from('809-875-3161').toString('hex'));
    expect(hexText).toContain(Buffer.from('829-627-3168').toString('hex'));
    expect(hexText).toContain(Buffer.from('solocamionessrl@gmail.com').toString('hex'));
    expect(hexText).toContain(Buffer.from('Av. Pdte.').toString('hex'));
    expect(hexText).toContain(Buffer.from('@solocamionessrl').toString('hex'));
    expect(hexText).toContain(Buffer.from('solo.camiones.srl').toString('hex'));
    expect(hexText).toContain(Buffer.from('Pagos por transferencia:').toString('hex'));
    expect(hexText).toContain(Buffer.from('Banco Popular Dominicano').toString('hex'));
    expect(hexText).toContain(Buffer.from('857578579').toString('hex'));
    expect(hexText).toContain(Buffer.from('Pagos con cheques a nombre de:').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('809-212-7751').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('jmvargas24@gmail.com').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('Av. Pte.').toString('hex'));
  });

  it('prints line notes and keeps the payment footer when the quote paginates', async () => {
    const pdf = await pdfkitQuotePdfRenderer.render({
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
    expect(hexText).toContain(Buffer.from('Nota larga').toString('hex'));
  });

  it('rejects any status other than QUOTE_ISSUED', async () => {
    await expect(
      pdfkitQuotePdfRenderer.render({
        ...facts,
        status: 'QUOTE_DRAFT' as unknown as 'QUOTE_ISSUED',
      }),
    ).rejects.toThrow('Unsupported quote PDF status: QUOTE_DRAFT');
  });
});
