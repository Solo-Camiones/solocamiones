import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../../../src/mocks/data/seed';
import { retryUsdProfitability, recordManualGrossProfit, setFxAvailable } from '../../../../src/mocks/services/profitability-commands';
import { buildProfitabilitySnapshot } from '../../../../src/mocks/services/profitability-catalog';
import { invoiceProfitUsd, usdProfitToDop } from '../../../../src/mocks/services/usd-profitability';
import { roundMoney } from '../../../../src/mocks/services/invoice-money';
import { profitabilityForInvoice } from '../../../../src/mocks/services/profitability-view';

const admin = createInitialState().users.find((user) => user.id === 'U-ADMIN')!;
const seller = createInitialState().users.find((user) => user.id === 'U-LAURA')!;

describe('USD profitability', () => {
  it('divides stored DOP cost by exchangeRateDopPerUsd', () => {
    const state = createInitialState();
    const invoice = state.invoices.find((entry) => entry.id === 'INV-096')!;
    const profit = invoiceProfitUsd(invoice, state, 61.5);
    expect(profit).toBe(roundMoney(1_200 - 42_000 / 61.5));
    expect(usdProfitToDop(profit!, 61.5)).toBe(roundMoney(profit! * 61.5));
  });

  it('leaves FAC-000096 pending until FX is toggled and retried', () => {
    const state = createInitialState();
    const invoice = state.invoices.find((entry) => entry.id === 'INV-096')!;
    expect(invoice.profitabilityPendingFx).toBe(true);

    const blocked = retryUsdProfitability(state, admin, { invoiceId: 'INV-096' });
    expect(blocked.ok).toBe(false);

    setFxAvailable(state, admin, { available: true });
    const retried = retryUsdProfitability(state, admin, { invoiceId: 'INV-096' });
    expect(retried.ok).toBe(true);
    expect(invoice.profitabilityPendingFx).toBe(false);
    expect(invoice.profitabilityUsd).toBe(roundMoney(1_200 - 42_000 / 61.5));
    expect(invoice.fxSource).toBe('DEMO_FX');
    expect(invoice.payments).toHaveLength(0);
    expect(invoice.status).toBe('COMPLETED');
    expect(state.items.find((item) => item.id === 'TUR-009')?.commercialState).toBe('SOLD');

    const snapshot = buildProfitabilitySnapshot(state, admin);
    const profitUsd = invoice.profitabilityUsd!;
    const profitDop = usdProfitToDop(profitUsd, 61.5);
    expect(profitabilityForInvoice(state, invoice, admin)?.profit).toBe(profitDop);
    expect(snapshot?.profitDop).toBe(roundMoney(8_900 + profitDop));
    expect(snapshot?.outstandingDop).toBe(23_100);
    expect(snapshot?.outstandingUsd).toBe(0);
    expect(snapshot).not.toHaveProperty('profitUsd');
  });

  it('does not expose a snapshot to sellers', () => {
    const state = createInitialState();
    expect(buildProfitabilitySnapshot(state, seller)).toBeUndefined();
    expect(retryUsdProfitability(state, seller, { invoiceId: 'INV-096' }).ok).toBe(false);
  });
});

describe('administrator-recorded gross profit', () => {
  it('lets an administrator record DOP profit when cost is unknown', () => {
    const state = createInitialState();
    const invoice = state.invoices.find((entry) => entry.id === 'INV-097')!;
    expect(profitabilityForInvoice(state, invoice, admin)?.profit).toBeNull();

    const recorded = recordManualGrossProfit(state, admin, {
      invoiceId: 'INV-097',
      profitDop: 1_250.5,
    });

    expect(recorded.ok).toBe(true);
    expect(invoice.manualGrossProfitDop).toBe(1_250.5);
    expect(invoice.payments).toHaveLength(1);
    expect(invoice.status).toBe('COMPLETED');
    expect(invoice.lines[0]?.acquisitionCostDop).toBeUndefined();

    const snapshot = buildProfitabilitySnapshot(state, admin);
    const row = snapshot?.invoices.find((entry) => entry.id === 'INV-097');
    expect(row?.profit).toBe(1_250.5);
    expect(row?.source).toBe('MANUAL');
    expect(row?.canRecordManual).toBe(true);
    expect(snapshot?.profitDop).toBe(8_900 + 1_250.5);
    expect(state.events.some((event) => event.type === 'GROSS_PROFIT_RECORDED')).toBe(true);
  });

  it('rejects sellers, pending FX invoices, and invoices with calculated profit', () => {
    const state = createInitialState();
    expect(
      recordManualGrossProfit(state, seller, {
        invoiceId: 'INV-097',
        profitDop: 100,
      }).ok,
    ).toBe(false);

    expect(
      recordManualGrossProfit(state, admin, {
        invoiceId: 'INV-096',
        profitDop: 100,
      }).ok,
    ).toBe(false);

    expect(
      recordManualGrossProfit(state, admin, {
        invoiceId: 'INV-098',
        profitDop: 100,
      }).ok,
    ).toBe(false);
  });

  it('requires a finite amount and does not require a reason', () => {
    const state = createInitialState();
    expect(
      recordManualGrossProfit(state, admin, {
        invoiceId: 'INV-097',
        profitDop: Number.NaN,
      }).ok,
    ).toBe(false);

    const recorded = recordManualGrossProfit(state, admin, {
      invoiceId: 'INV-097',
      profitDop: 200,
    });
    expect(recorded.ok).toBe(true);
    expect(state.invoices.find((entry) => entry.id === 'INV-097')?.manualGrossProfitDop).toBe(200);
  });
});
