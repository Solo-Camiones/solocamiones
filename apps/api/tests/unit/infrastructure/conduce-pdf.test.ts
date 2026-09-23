import { describe, expect, it } from 'vitest';

import {
  conducePdfFilename,
  pdfkitConducePdfRenderer,
} from '../../../src/infrastructure/conduce-pdf/index.js';

const facts = {
  status: 'CONDUCE' as const,
  conduceNumber: 'CON-000007',
  originQuoteNumber: null as string | null,
  currency: 'DOP' as const,
  customerName: 'Transportes del Este',
  customerRnc: '1-01-11111-1',
  customerPhone: '809-555-0101',
  sellerName: 'María Pérez',
  conduceIssuedAt: new Date('2026-09-15T18:00:00.000Z'),
  dueDate: new Date('2026-10-15T00:00:00.000Z'),
  cancelledAt: null,
  cancelReason: null,
  cancelledByName: null,
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
  totals: {
    gross: '118.00',
    base: '100.00',
    itbis: '18.00',
    discount: '0.00',
    discountPercent: '0.00',
  },
};

function pdfHexText(pdf: Buffer): string {
  return [...pdf.toString('latin1').matchAll(/\[(.*?)\]\s*TJ/gs)]
    .flatMap((operation) => [...operation[1].matchAll(/<([0-9a-f]+)>/gi)])
    .map((operand) => operand[1])
    .join('');
}

describe('conduce PDF renderer (CON-004)', () => {
  it('names the download CON-xxxxxx.pdf', () => {
    expect(conducePdfFilename(facts.conduceNumber)).toBe('CON-000007.pdf');
  });

  it('prints CONDUCE with CON- number, customer, seller, lines, and totals', async () => {
    const pdf = await pdfkitConducePdfRenderer.render(facts);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const hexText = pdfHexText(pdf);
    expect(hexText).toContain(Buffer.from('CONDUCE').toString('hex'));
    expect(hexText).toContain(Buffer.from('CON-000007').toString('hex'));
    expect(hexText).toContain(Buffer.from('Transportes del Este').toString('hex'));
    expect(hexText).toContain(Buffer.from('1-01-11111-1').toString('hex'));
    expect(hexText).toContain(Buffer.from('María Pérez', 'latin1').toString('hex'));
    expect(hexText).toContain(Buffer.from('Vendedor').toString('hex'));
    expect(hexText).toContain(Buffer.from('Filtro').toString('hex'));
    expect(hexText).toContain(Buffer.from('Vencimiento').toString('hex'));
    expect(hexText).toContain(Buffer.from('Subtotal').toString('hex'));
    expect(hexText).toContain(Buffer.from('Descuento(0%)').toString('hex'));
    expect(hexText).toContain(Buffer.from('ITBIS').toString('hex'));
    expect(hexText).toContain(Buffer.from('TOTAL').toString('hex'));
    expect(pdf.toString('latin1')).toContain('3131382e3030');
  });

  it('prints origin COT- when the conduce came from a quote', async () => {
    const pdf = await pdfkitConducePdfRenderer.render({
      ...facts,
      originQuoteNumber: 'COT-000012',
    });
    const hexText = pdfHexText(pdf);
    expect(hexText).toContain(Buffer.from('COT-000012').toString('hex'));
  });

  it('never prints NCF, payment state, or balance', async () => {
    const pdf = await pdfkitConducePdfRenderer.render(facts);
    const hexText = pdfHexText(pdf);
    expect(hexText).not.toContain(Buffer.from('NCF:').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('FACTURA').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('FAC-').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('SALDO PENDIENTE').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('Saldo actualizado al').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('PENDIENTE').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('ABONADO').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('Al contado').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('A crédito', 'latin1').toString('hex'));
  });

  it('prints CANCELADA without inventing payment history', async () => {
    const pdf = await pdfkitConducePdfRenderer.render({
      ...facts,
      status: 'CANCELLED',
      cancelledAt: new Date('2026-09-16T18:00:00.000Z'),
      cancelReason: 'Solicitud del cliente',
      cancelledByName: 'Ana Administradora',
    });
    const hexText = pdfHexText(pdf);
    expect(hexText).toContain(Buffer.from('CANCELADA').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('NCF:').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('SALDO PENDIENTE').toString('hex'));
  });

  it('keeps the payment footer when the conduce paginates', async () => {
    const pdf = await pdfkitConducePdfRenderer.render({
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

  it('rejects unsupported statuses', async () => {
    await expect(
      pdfkitConducePdfRenderer.render({
        ...facts,
        status: 'COMPLETED' as unknown as 'CONDUCE',
      }),
    ).rejects.toThrow('Unsupported conduce PDF status: COMPLETED');
  });
});
