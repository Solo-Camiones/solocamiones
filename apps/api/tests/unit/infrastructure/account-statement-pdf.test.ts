import { describe, expect, it } from 'vitest';

import { pdfkitAccountStatementRenderer } from '../../../src/infrastructure/account-statement-pdf/index.js';

function pdfHexText(pdf: Buffer): string {
  return [...pdf.toString('latin1').matchAll(/\[(.*?)\]\s*TJ/gs)]
    .flatMap((operation) => [...operation[1].matchAll(/<([0-9a-f]+)>/gi)])
    .map((operand) => operand[1])
    .join('');
}

function facts(invoiceCount = 2) {
  const rows = Array.from({ length: invoiceCount }, (_, index) => ({
    number: `FAC-${String(index + 1).padStart(6, '0')}`,
    issuedAt: new Date('2026-09-01T14:00:00.000Z'),
    dueDate: new Date('2026-10-01T00:00:00.000Z'),
    paymentState: index === 0 ? ('PARTIALLY_PAID' as const) : ('PENDING' as const),
    invoiced: '1000.00',
    paid: index === 0 ? '400.00' : '0.00',
    balance: index === 0 ? '600.00' : '1000.00',
  }));
  return {
    customerName: 'Transportes del Caribe SRL',
    customerRnc: '131234567',
    generatedAt: new Date('2026-09-16T15:30:00.000Z'),
    rows,
    totals: {
      invoiced: `${invoiceCount * 1000}.00`,
      paid: '400.00',
      balance: `${invoiceCount * 1000 - 400}.00`,
    },
  };
}

describe('account statement PDF renderer (STMT-001)', () => {
  it('renders the statement title, invoice rows, cumulative totals, and no payment movements', async () => {
    const pdf = await pdfkitAccountStatementRenderer.render(facts());
    const text = pdf.toString('latin1');
    const hexText = pdfHexText(pdf);

    expect(text.slice(0, 5)).toBe('%PDF-');
    expect(hexText).toContain(Buffer.from('FAC-000001').toString('hex'));
    expect(hexText).toContain(Buffer.from('FAC-000002').toString('hex'));
    expect(hexText).toContain(Buffer.from('ABONADO').toString('hex'));
    expect(hexText).toContain(Buffer.from('SALDO PENDIENTE').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('TRANSFER').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('CHECK').toString('hex'));
  });

  it('paginates a large statement and keeps every invoice row', async () => {
    const pdf = await pdfkitAccountStatementRenderer.render(facts(60));
    const text = pdf.toString('latin1');
    const hexText = pdfHexText(pdf);
    const pageCount = (text.match(/\/Type \/Page\b/g) ?? []).length;

    expect(pageCount).toBeGreaterThan(1);
    expect(hexText).toContain(Buffer.from('FAC-000001').toString('hex'));
    expect(hexText).toContain(Buffer.from('FAC-000060').toString('hex'));
    expect(hexText).toContain(Buffer.from('Continuaci').toString('hex'));
  });
});
