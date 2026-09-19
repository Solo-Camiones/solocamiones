import { describe, expect, it } from 'vitest';

import { SELLER_SALES_PDF_EMPTY_MESSAGE } from '../../../src/infrastructure/seller-sales-pdf/constants.js';
import { pdfkitSellerSalesRenderer } from '../../../src/infrastructure/seller-sales-pdf/index.js';
import type { SellerSalesPdfFacts } from '../../../src/infrastructure/seller-sales-pdf/types.js';

function pdfHexText(pdf: Buffer): string {
  return [...pdf.toString('latin1').matchAll(/\[(.*?)\]\s*TJ/gs)]
    .flatMap((operation) => [...operation[1].matchAll(/<([0-9a-f]+)>/gi)])
    .map((operand) => operand[1])
    .join('');
}

function facts(rowCount = 2, overrides: Partial<SellerSalesPdfFacts> = {}): SellerSalesPdfFacts {
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    documentTypeLabel: index % 2 === 0 ? 'Factura' : 'Cotización',
    number:
      index % 2 === 0
        ? `FAC-${String(index + 1).padStart(6, '0')}`
        : `COT-${String(index + 1).padStart(6, '0')}`,
    documentDateLabel: '18/09/2026',
    sellerName: index < 2 ? 'Sara Vendedora' : 'Pedro Vendedor',
    customerName: `Cliente ${index + 1}`,
    currency: 'DOP' as const,
    grossLabel: `RD$${(1000 * (index + 1)).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
  }));
  return {
    dateFrom: '2026-09-01',
    dateTo: '2026-09-18',
    generatedAt: new Date('2026-09-18T15:30:00.000Z'),
    sellerFilterName: null,
    rows,
    totals: [
      {
        sellerName: 'Sara Vendedora',
        currency: 'DOP',
        grossLabel: 'RD$3,000.00',
      },
    ],
    ...overrides,
  };
}

describe('seller sales PDF renderer', () => {
  it('renders the title, document rows, seller totals, and corporate identity', async () => {
    const pdf = await pdfkitSellerSalesRenderer.render(
      facts(2, { sellerFilterName: 'Sara Vendedora' }),
    );
    const text = pdf.toString('latin1');
    const hexText = pdfHexText(pdf);

    expect(text.slice(0, 5)).toBe('%PDF-');
    expect(hexText).toContain(Buffer.from('VENTAS POR VENDEDOR').toString('hex'));
    expect(hexText).toContain(Buffer.from('FAC-000001').toString('hex'));
    expect(hexText).toContain(Buffer.from('COT-000002').toString('hex'));
    expect(hexText).toContain(Buffer.from('Sara Vendedora').toString('hex'));
    expect(hexText).toContain(Buffer.from('Totales por vendedor').toString('hex'));
    expect(hexText).toContain(Buffer.from('RD$3,000.00').toString('hex'));
    expect(hexText).toContain(Buffer.from('SOLO CAMIONES').toString('hex'));
    expect(hexText).toContain(Buffer.from('Vendedor: Sara Vendedora').toString('hex'));
    expect(hexText).toContain(Buffer.from('01/09/2026').toString('hex'));
    expect(hexText).toContain(Buffer.from('18/09/2026').toString('hex'));
  });

  it('shows the empty-range message when there are no rows', async () => {
    const pdf = await pdfkitSellerSalesRenderer.render(facts(0, { totals: [] }));
    const hexText = pdfHexText(pdf);

    expect(hexText).toContain(Buffer.from(SELLER_SALES_PDF_EMPTY_MESSAGE).toString('hex'));
    expect(hexText).toContain(Buffer.from('VENTAS POR VENDEDOR').toString('hex'));
    expect(hexText).not.toContain(Buffer.from('FAC-').toString('hex'));
  });

  it('paginates a large report and keeps every document row', async () => {
    const pdf = await pdfkitSellerSalesRenderer.render(facts(60));
    const text = pdf.toString('latin1');
    const hexText = pdfHexText(pdf);
    const pageCount = (text.match(/\/Type \/Page\b/g) ?? []).length;

    expect(pageCount).toBeGreaterThan(1);
    expect(hexText).toContain(Buffer.from('FAC-000001').toString('hex'));
    expect(hexText).toContain(Buffer.from('Continuaci').toString('hex'));
  });
});
