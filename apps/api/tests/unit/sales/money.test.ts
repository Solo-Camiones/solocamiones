import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../../src/infrastructure/errors/app-error.js';
import {
  ITBIS_INCLUDED_RATE,
  calculateLineMoney,
  calculateLineProfitDop,
  calculateLineProfitUsdReportingDop,
  calculatedCompletedProfitability,
  isTaxableLineType,
  knownCostAmount,
  normalizeAcquisitionCost,
  parsePositiveDecimal,
  pendingFxProfitability,
  PROFITABILITY_REASONS,
  reportedInvoiceProfitability,
  roundMoney,
  sumCalculatedProfit,
  sumInvoiceMoney,
} from '../../../src/features/sales/money/index.js';

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function expectMoney(actual: Prisma.Decimal, expected: string): void {
  expect(actual.toFixed(2)).toBe(expected);
}

describe('ITBIS included rate', () => {
  it('is the fixed 18% Decimal, not a scattered 0.18 number', () => {
    expect(ITBIS_INCLUDED_RATE.equals(money('0.18'))).toBe(true);
  });
});

describe('roundMoney', () => {
  it('rounds to two decimals with HALF_UP', () => {
    expectMoney(roundMoney('1.225'), '1.23');
    expectMoney(roundMoney('1.224'), '1.22');
    expectMoney(roundMoney(money('19.50')), '19.50');
  });

  it('rejects non-numeric input', () => {
    expect(() => roundMoney('N/A')).toThrow(AppError);
    expect(() => roundMoney('')).toThrow(AppError);
    try {
      roundMoney('abc');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('VALIDATION');
    }
  });
});

describe('isTaxableLineType', () => {
  it('treats merchandise kinds as taxable and service/delivery as not', () => {
    expect(isTaxableLineType('GENERIC')).toBe(true);
    expect(isTaxableLineType('EXTERNAL')).toBe(true);
    expect(isTaxableLineType('ITEM')).toBe(true);
    expect(isTaxableLineType('QTY')).toBe(true);
    expect(isTaxableLineType('SERVICE')).toBe(false);
    expect(isTaxableLineType('DELIVERY')).toBe(false);
  });
});

describe('calculateLineMoney', () => {
  it('extracts included 18% ITBIS from fiscal GENERIC 118 → base 100, itbis 18', () => {
    const line = calculateLineMoney({ type: 'GENERIC', unitPrice: '118', fiscal: true });

    expect(line.taxable).toBe(true);
    expectMoney(line.gross, '118.00');
    expectMoney(line.base, '100.00');
    expectMoney(line.itbis, '18.00');
    expect(line.base.plus(line.itbis).equals(line.gross)).toBe(true);
  });

  it('extracts included 18% from fiscal EXTERNAL 19.50 with per-line HALF_UP', () => {
    const line = calculateLineMoney({ type: 'EXTERNAL', unitPrice: '19.50', fiscal: true });

    expectMoney(line.gross, '19.50');
    expectMoney(line.base, '16.53');
    expectMoney(line.itbis, '2.97');
    expect(line.base.plus(line.itbis).equals(line.gross)).toBe(true);
  });

  it('treats ITEM and QTY as taxable merchandise when passed in', () => {
    const item = calculateLineMoney({ type: 'ITEM', unitPrice: '118', quantity: '1', fiscal: true });
    const qty = calculateLineMoney({ type: 'QTY', unitPrice: '59', quantity: '2', fiscal: true });

    expectMoney(item.itbis, '18.00');
    expectMoney(qty.gross, '118.00');
    expectMoney(qty.itbis, '18.00');
  });

  it('keeps SERVICE and DELIVERY at ITBIS 0 even when fiscal', () => {
    const service = calculateLineMoney({ type: 'SERVICE', unitPrice: '500', fiscal: true });
    const delivery = calculateLineMoney({ type: 'DELIVERY', unitPrice: '150', fiscal: true });

    expect(service.taxable).toBe(false);
    expectMoney(service.gross, '500.00');
    expectMoney(service.base, '500.00');
    expectMoney(service.itbis, '0.00');
    expectMoney(delivery.itbis, '0.00');
    expectMoney(delivery.base, '150.00');
  });

  it('does not extract ITBIS from non-fiscal GENERIC or EXTERNAL', () => {
    const generic = calculateLineMoney({ type: 'GENERIC', unitPrice: '118', fiscal: false });
    const external = calculateLineMoney({ type: 'EXTERNAL', unitPrice: '19.50', fiscal: false });

    expectMoney(generic.itbis, '0.00');
    expectMoney(generic.base, '118.00');
    expectMoney(generic.gross, '118.00');
    expectMoney(external.itbis, '0.00');
    expectMoney(external.base, '19.50');
  });

  it('allows free delivery as numeric 0', () => {
    const delivery = calculateLineMoney({ type: 'DELIVERY', unitPrice: '0', fiscal: true });

    expectMoney(delivery.gross, '0.00');
    expectMoney(delivery.itbis, '0.00');
  });

  it('rejects negative prices and quantities', () => {
    expect(() =>
      calculateLineMoney({ type: 'GENERIC', unitPrice: '-1', fiscal: true }),
    ).toThrow(AppError);
    expect(() =>
      calculateLineMoney({ type: 'DELIVERY', unitPrice: '-0.01', fiscal: false }),
    ).toThrow(AppError);
    expect(() =>
      calculateLineMoney({ type: 'GENERIC', unitPrice: '10', quantity: '-1', fiscal: true }),
    ).toThrow(AppError);

    try {
      calculateLineMoney({ type: 'GENERIC', unitPrice: '-10', fiscal: false });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('VALIDATION');
    }
  });

  it('rejects non-numeric prices and unknown line types', () => {
    expect(() =>
      calculateLineMoney({ type: 'GENERIC', unitPrice: 'N/A', fiscal: true }),
    ).toThrow(AppError);
    expect(() =>
      calculateLineMoney({ type: 'GENERIC', unitPrice: '', fiscal: true }),
    ).toThrow(AppError);
    expect(() =>
      calculateLineMoney({
        type: 'GENERIC',
        unitPrice: Number.NaN as unknown as string,
        fiscal: true,
      }),
    ).toThrow(AppError);
    expect(() =>
      calculateLineMoney({
        type: 'UNKNOWN' as 'GENERIC',
        unitPrice: '10',
        fiscal: true,
      }),
    ).toThrow(AppError);
  });
});

describe('sumInvoiceMoney', () => {
  it('totals equal the sum of per-line rounded ITBIS, not one extraction from combined gross', () => {
    const first = calculateLineMoney({ type: 'GENERIC', unitPrice: '19.50', fiscal: true });
    const second = calculateLineMoney({ type: 'EXTERNAL', unitPrice: '19.50', fiscal: true });
    const totals = sumInvoiceMoney([first, second]);

    expectMoney(first.itbis, '2.97');
    expectMoney(second.itbis, '2.97');
    expectMoney(totals.gross, '39.00');
    expectMoney(totals.itbis, '5.94');
    expectMoney(totals.base, '33.06');
    expect(totals.itbis.equals(first.itbis.plus(second.itbis))).toBe(true);

    const combinedGrossItbis = roundMoney(money('39.00').minus(roundMoney(money('39.00').div('1.18'))));
    expect(combinedGrossItbis.toFixed(2)).toBe('5.95');
    expect(totals.itbis.equals(combinedGrossItbis)).toBe(false);
  });
});

describe('normalizeAcquisitionCost', () => {
  it('does not treat UNKNOWN cost as zero', () => {
    const unknown = normalizeAcquisitionCost({ provenance: 'UNKNOWN', amount: '0' });

    expect(unknown.provenance).toBe('UNKNOWN');
    expect(unknown.amount).toBeNull();
    expect(knownCostAmount(unknown)).toBeNull();
    expect(knownCostAmount(unknown)?.equals(money('0')) ?? false).toBe(false);
  });

  it('keeps ACTUAL and ESTIMATED amounts, including numeric zero', () => {
    const actualZero = normalizeAcquisitionCost({ provenance: 'ACTUAL', amount: '0' });
    const estimated = normalizeAcquisitionCost({ provenance: 'ESTIMATED', amount: '250.50' });

    expect(actualZero.amount?.equals(money('0'))).toBe(true);
    expect(estimated.amount?.equals(money('250.50'))).toBe(true);
  });
});

describe('calculateLineProfitDop', () => {
  it('subtracts actual or estimated DOP cost from selling price and never treats UNKNOWN as zero', () => {
    const actual = calculateLineProfitDop(
      {
        type: 'GENERIC',
        unitPrice: '18000.00',
        quantity: '1',
        gross: money('18000.00'),
        acquisitionCostDop: money('12300.00'),
        costProvenance: 'ACTUAL',
      },
      false,
    );
    const estimated = calculateLineProfitDop(
      {
        type: 'EXTERNAL',
        unitPrice: '18000.00',
        quantity: '1',
        gross: money('18000.00'),
        acquisitionCostDop: money('12300.00'),
        costProvenance: 'ESTIMATED',
      },
      false,
    );
    const unknown = calculateLineProfitDop(
      {
        type: 'GENERIC',
        unitPrice: '18000.00',
        quantity: '1',
        gross: money('18000.00'),
        acquisitionCostDop: null,
        costProvenance: 'UNKNOWN',
      },
      false,
    );

    expect(actual.status).toBe('CALCULATED');
    expectMoney(actual.profitDop as Prisma.Decimal, '5700.00');
    expectMoney(actual.margin as Prisma.Decimal, '31.67');
    expect(estimated.status).toBe('CALCULATED');
    expectMoney(estimated.profitDop as Prisma.Decimal, '5700.00');
    expect(unknown).toMatchObject({
      status: 'UNAVAILABLE',
      reason: PROFITABILITY_REASONS.UNKNOWN_COST,
      profitDop: null,
      margin: null,
    });
  });

  it('counts SERVICE and DELIVERY selling price as profit without inventing a stored cost', () => {
    const service = calculateLineProfitDop(
      {
        type: 'SERVICE',
        unitPrice: '500.00',
        quantity: '1',
        gross: money('500.00'),
        acquisitionCostDop: null,
        costProvenance: null,
      },
      true,
    );
    const freeDelivery = calculateLineProfitDop(
      {
        type: 'DELIVERY',
        unitPrice: '0.00',
        quantity: '1',
        gross: money('0.00'),
        acquisitionCostDop: null,
        costProvenance: null,
      },
      true,
    );

    expectMoney(service.profitDop as Prisma.Decimal, '500.00');
    expectMoney(service.margin as Prisma.Decimal, '100.00');
    expectMoney(freeDelivery.profitDop as Prisma.Decimal, '0.00');
    expect(freeDelivery.margin).toBeNull();
  });
});

describe('USD profitability COST-003', () => {
  const generic = {
    type: 'GENERIC' as const,
    unitPrice: '118.00',
    quantity: '1',
    gross: money('118.00'),
    acquisitionCostDop: money('80.00'),
    costProvenance: 'ACTUAL' as const,
  };

  it('divides stored DOP cost by DOP-per-USD and reports profitDop = profitUsd * rate', () => {
    const rate = money('61.50');
    const line = calculateLineProfitUsdReportingDop(generic, false, rate);
    expect(line.status).toBe('CALCULATED');
    expectMoney(line.profitDop as Prisma.Decimal, '7177.00');
    expectMoney(line.margin as Prisma.Decimal, '98.90');
  });

  it('does not invert a USD/DOP conversion_rate', () => {
    const inverted = calculateLineProfitUsdReportingDop(generic, false, money('1').div('61.50'));
    expect(inverted.profitDop?.toFixed(2)).not.toBe('7177.00');
  });

  it('keeps USD without a rate as PENDING_FX_RATE and leaves DOP independent of a rate', () => {
    const pending = calculatedCompletedProfitability({
      status: 'COMPLETED',
      currency: 'USD',
      fiscal: false,
      lines: [generic],
    });
    const withRate = calculatedCompletedProfitability({
      status: 'COMPLETED',
      currency: 'USD',
      fiscal: false,
      lines: [generic],
      exchangeRateDopPerUsd: money('61.50'),
    });
    const dop = calculatedCompletedProfitability({
      status: 'COMPLETED',
      currency: 'DOP',
      fiscal: false,
      lines: [generic],
      exchangeRateDopPerUsd: money('61.50'),
    });

    expect(pending).toMatchObject({
      status: 'UNAVAILABLE',
      reason: PROFITABILITY_REASONS.PENDING_FX_RATE,
      profitDop: null,
    });
    expectMoney(withRate!.profitDop as Prisma.Decimal, '7177.00');
    expectMoney(dop!.profitDop as Prisma.Decimal, '38.00');
  });

  it('uses UNKNOWN_COST after a rate is present rather than pending FX', () => {
    const unknown = calculatedCompletedProfitability({
      status: 'COMPLETED',
      currency: 'USD',
      fiscal: false,
      lines: [
        {
          type: 'GENERIC',
          unitPrice: '118.00',
          quantity: '1',
          gross: money('118.00'),
          acquisitionCostDop: null,
          costProvenance: 'UNKNOWN',
        },
      ],
      exchangeRateDopPerUsd: money('61.50'),
    });
    expect(unknown).toMatchObject({
      status: 'UNAVAILABLE',
      reason: PROFITABILITY_REASONS.UNKNOWN_COST,
    });
  });
});

describe('sumCalculatedProfit', () => {
  it('leaves the invoice unavailable when any line has an unknown cost', () => {
    const known = calculateLineProfitDop(
      {
        type: 'GENERIC',
        unitPrice: '18000.00',
        quantity: '1',
        gross: money('18000.00'),
        acquisitionCostDop: money('12300.00'),
        costProvenance: 'ACTUAL',
      },
      false,
    );
    const unknown = calculateLineProfitDop(
      {
        type: 'GENERIC',
        unitPrice: '100.00',
        quantity: '1',
        gross: money('100.00'),
        acquisitionCostDop: null,
        costProvenance: 'UNKNOWN',
      },
      false,
    );
    const mixed = sumCalculatedProfit([
      { profitability: known, sellingPrice: money('18000.00') },
      { profitability: unknown, sellingPrice: money('100.00') },
    ]);
    const allKnown = sumCalculatedProfit([
      { profitability: known, sellingPrice: money('18000.00') },
    ]);
    const none = sumCalculatedProfit([
      { profitability: unknown, sellingPrice: money('100.00') },
    ]);

    expectMoney(allKnown.profitDop as Prisma.Decimal, '5700.00');
    expectMoney(allKnown.margin as Prisma.Decimal, '31.67');
    expect(mixed).toMatchObject({
      status: 'UNAVAILABLE',
      reason: PROFITABILITY_REASONS.UNKNOWN_COST,
      profitDop: null,
      margin: null,
    });
    expect(none).toMatchObject({
      status: 'UNAVAILABLE',
      reason: PROFITABILITY_REASONS.UNKNOWN_COST,
      profitDop: null,
    });
  });
});

describe('reportedInvoiceProfitability', () => {
  it('uses MANUAL only when calculated profit is unavailable for unknown cost', () => {
    const calculated = calculateLineProfitDop(
      {
        type: 'GENERIC',
        unitPrice: '100.00',
        quantity: '1',
        gross: money('100.00'),
        acquisitionCostDop: money('40.00'),
        costProvenance: 'ESTIMATED',
      },
      false,
    );
    const unknown = calculateLineProfitDop(
      {
        type: 'GENERIC',
        unitPrice: '100.00',
        quantity: '1',
        gross: money('100.00'),
        acquisitionCostDop: null,
        costProvenance: 'UNKNOWN',
      },
      false,
    );
    const sellingPrice = money('100.00');
    const overlay = reportedInvoiceProfitability(unknown, money('20.00'), sellingPrice);
    const calculatedWins = reportedInvoiceProfitability(calculated, money('20.00'), sellingPrice);
    const pending = reportedInvoiceProfitability(
      pendingFxProfitability(),
      money('20.00'),
      sellingPrice,
    );
    const zero = reportedInvoiceProfitability(unknown, money('0.00'), sellingPrice);
    const loss = reportedInvoiceProfitability(unknown, money('-10.00'), sellingPrice);

    expect(overlay).toMatchObject({ status: 'MANUAL', reason: null });
    expectMoney(overlay!.profitDop as Prisma.Decimal, '20.00');
    expectMoney(overlay!.margin as Prisma.Decimal, '20.00');
    expect(calculatedWins?.status).toBe('CALCULATED');
    expectMoney(calculatedWins!.profitDop as Prisma.Decimal, '60.00');
    expect(pending).toMatchObject({
      status: 'UNAVAILABLE',
      reason: PROFITABILITY_REASONS.PENDING_FX_RATE,
      profitDop: null,
    });
    expectMoney(zero!.profitDop as Prisma.Decimal, '0.00');
    expectMoney(loss!.profitDop as Prisma.Decimal, '-10.00');
  });
});

describe('parsePositiveDecimal', () => {
  it('rejects zero quantity while allowing a positive amount', () => {
    expect(parsePositiveDecimal('2', 'quantity').equals(money('2'))).toBe(true);
    expect(() => parsePositiveDecimal('0', 'quantity')).toThrow(AppError);
  });
});
