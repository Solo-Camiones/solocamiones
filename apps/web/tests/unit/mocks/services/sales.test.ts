import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../../../src/mocks/data/seed';
import {
  addDraftLine,
  addPayment,
  cancelInvoice,
  confirmInvoice,
  correctCurrency,
  createDraft,
  setDraftLinePrice,
  setDraftMeta,
} from '../../../../src/mocks/services/sales-commands';
import { buildInvoiceDetail, buildSalesList } from '../../../../src/mocks/services/sales-catalog';
import {
  invoiceBalance,
  invoiceTotal,
  lineBase,
  lineItbis,
} from '../../../../src/mocks/services/invoice-money';
import { recordManualGrossProfit } from '../../../../src/mocks/services/profitability-commands';

const admin = createInitialState().users.find((user) => user.id === 'U-ADMIN')!;
const seller = createInitialState().users.find((user) => user.id === 'U-LAURA')!;

describe('sales catalog seed', () => {
  it('shows FAC-000098 unpaid and FAC-000099 partially paid', () => {
    const rows = buildSalesList(createInitialState(), 'COMPLETED');
    const fac098 = rows.find((row) => row.number === 'FAC-000098');
    const fac099 = rows.find((row) => row.number === 'FAC-000099');

    expect(fac098).toMatchObject({ paymentState: 'UNPAID', balance: 19_500, currency: 'DOP' });
    expect(fac099).toMatchObject({ paymentState: 'PARTIALLY_PAID', balance: 3_600, total: 7_200 });
  });

  it('extracts included ITBIS only on fiscal taxable lines', () => {
    const state = createInitialState();
    const fiscal = state.invoices.find((entry) => entry.id === 'INV-098')!;
    const nonFiscal = state.invoices.find((entry) => entry.id === 'INV-099')!;

    expect(invoiceTotal(fiscal)).toBe(19_500);
    expect(lineBase(fiscal.lines[0], true)).toBe(16_525.42);
    expect(lineItbis(fiscal.lines[0], true)).toBe(2_974.58);
    expect(lineItbis(nonFiscal.lines[0], false)).toBe(0);
    expect(lineBase(nonFiscal.lines[0], false)).toBe(7_200);
    expect(invoiceTotal(nonFiscal)).toBe(7_200);
  });

  it('omits profitability from seller projections', () => {
    const state = createInitialState();
    const invoice = state.invoices.find((entry) => entry.id === 'INV-098')!;
    const sellerView = buildInvoiceDetail(state, invoice, seller);
    const adminView = buildInvoiceDetail(state, invoice, admin);

    expect(sellerView.profitability).toBeUndefined();
    expect(sellerView.actions.canCancel).toBe(false);
    expect(sellerView.actions.canCorrectCurrency).toBe(false);
    expect(adminView.profitability?.profit).toBe(6_700);
    expect(adminView.actions.canCancel).toBe(true);
    expect(adminView.actions.canCorrectCurrency).toBe(true);
  });
});

describe('addPayment', () => {
  it('records a partial payment and updates the chip state', () => {
    const state = createInitialState();
    const result = addPayment(state, seller, {
      invoiceId: 'INV-098',
      amount: 5_000,
      method: 'TRANSFER',
      effectiveDate: '2026-09-09',
      reference: 'TRX-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.paymentState).toBe('PARTIALLY_PAID');
    expect(invoiceBalance(result.value)).toBe(14_500);
    expect(state.items.find((item) => item.id === 'ARR-002')?.commercialState).toBe('SOLD');
  });

  it('rejects overpayment and non-positive amounts', () => {
    const state = createInitialState();

    expect(
      addPayment(state, seller, {
        invoiceId: 'INV-098',
        amount: 20_000,
        method: 'CASH',
        effectiveDate: '2026-09-09',
      }).ok,
    ).toBe(false);
    expect(
      addPayment(state, seller, {
        invoiceId: 'INV-098',
        amount: 0,
        method: 'CASH',
        effectiveDate: '2026-09-09',
      }).ok,
    ).toBe(false);
    expect(
      addPayment(state, seller, {
        invoiceId: 'INV-098',
        amount: -10,
        method: 'CASH',
        effectiveDate: '2026-09-09',
      }).ok,
    ).toBe(false);
    expect(state.invoices.find((entry) => entry.id === 'INV-098')?.payments).toEqual([]);
  });

  it('returns the same payment when the idempotency key is reused', () => {
    const state = createInitialState();
    const input = {
      invoiceId: 'INV-099' as const,
      amount: 3_600,
      method: 'CARD' as const,
      effectiveDate: '2026-09-09',
      idempotencyKey: 'pay-once',
    };

    const first = addPayment(state, seller, input);
    const second = addPayment(state, seller, input);

    expect(first.ok && second.ok).toBe(true);
    expect(state.invoices.find((entry) => entry.id === 'INV-099')?.payments).toHaveLength(2);
    expect(state.invoices.find((entry) => entry.id === 'INV-099')?.paymentState).toBe('PAID');
  });
});

describe('cancelInvoice', () => {
  it('cancels a pending dismantling invoice and restores availability without detaching the piece', () => {
    const state = createInitialState();
    const result = cancelInvoice(state, admin, {
      invoiceId: 'INV-098',
      reason: 'Cliente desistió',
    });

    expect(result.ok).toBe(true);
    expect(state.invoices.find((entry) => entry.id === 'INV-098')?.status).toBe('CANCELLED');
    expect(state.workOrders.find((order) => order.id === 'OD-DEMO-061')?.status).toBe('CANCELLED');
    const piece = state.items.find((item) => item.id === 'ARR-002')!;
    expect(piece.commercialState).toBe('AVAILABLE');
    expect(piece.physicalRelationship).toBe('INSTALLED');
    expect(piece.parentId).toBe('MOT-001');
  });

  it('requires an explicit in-progress decision and supports stop vs continue', () => {
    const missing = cancelInvoice(createInitialState(), admin, {
      invoiceId: 'INV-096',
      reason: 'Error de venta',
    });
    expect(missing.ok).toBe(false);

    const stopped = createInitialState();
    expect(
      cancelInvoice(stopped, admin, {
        invoiceId: 'INV-096',
        reason: 'Error de venta',
        inProgressDecision: 'STOP',
      }).ok,
    ).toBe(true);
    expect(stopped.workOrders.find((order) => order.id === 'OD-DEMO-060')?.status).toBe(
      'CANCELLED',
    );
    expect(stopped.items.find((item) => item.id === 'TUR-009')?.physicalRelationship).toBe(
      'INSTALLED',
    );

    const continued = createInitialState();
    expect(
      cancelInvoice(continued, admin, {
        invoiceId: 'INV-096',
        reason: 'Sigue el desarme',
        inProgressDecision: 'CONTINUE',
      }).ok,
    ).toBe(true);
    expect(continued.workOrders.find((order) => order.id === 'OD-DEMO-060')?.status).toBe(
      'IN_PROGRESS',
    );
    expect(continued.items.find((item) => item.id === 'TUR-009')?.commercialState).toBe(
      'AVAILABLE',
    );
  });

  it('records the full net refund and ignores a larger requested amount', () => {
    const state = createInitialState();
    const cancelled = cancelInvoice(state, admin, {
      invoiceId: 'INV-099',
      reason: 'Devolución',
      refundAmount: 8_000,
      refundMethod: 'CASH',
    });
    expect(cancelled.ok).toBe(true);
    const invoice = state.invoices.find((entry) => entry.id === 'INV-099')!;
    expect(invoice.status).toBe('CANCELLED');
    expect(
      invoice.payments.some((payment) => payment.kind === 'REFUND' && payment.amount === 3_600),
    ).toBe(true);
    expect(state.qtyProducts.find((product) => product.id === 'QTY-OIL-15W40')?.onHand).toBe(52);
  });

  it('rejects cancellation without a reason', () => {
    const result = cancelInvoice(createInitialState(), admin, {
      invoiceId: 'INV-097',
      reason: '   ',
    });
    expect(result.ok).toBe(false);
  });

  it('CANCEL-003: restoring an assembly sale also restores Sold descendants', () => {
    const state = createInitialState();
    const created = createDraft(state, seller);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const draftId = created.value.draftId;

    expect(addDraftLine(state, seller, { draftId, type: 'ITEM', itemId: 'MOT-003' }).ok).toBe(true);
    const lineId = state.invoices.find((entry) => entry.id === draftId)!.lines[0]!.id;
    expect(setDraftLinePrice(state, seller, { draftId, lineId, unitPrice: 350_000 }).ok).toBe(true);
    expect(setDraftMeta(state, seller, { draftId, customerId: 'C1' }).ok).toBe(true);
    expect(confirmInvoice(state, seller, draftId).ok).toBe(true);

    const engineAfterSale = state.items.find((item) => item.id === 'MOT-003')!;
    const alternatorAfterSale = state.items.find((item) => item.id === 'ALT-011')!;
    expect(engineAfterSale.commercialState).toBe('SOLD');
    expect(alternatorAfterSale.commercialState).toBe('SOLD');
    expect(alternatorAfterSale.physicalRelationship).toBe('INSTALLED');
    expect(alternatorAfterSale.parentId).toBe('MOT-003');

    const cancelled = cancelInvoice(state, admin, {
      invoiceId: draftId,
      reason: 'Cliente desistió del ensamblaje',
    });
    expect(cancelled.ok).toBe(true);

    const engine = state.items.find((item) => item.id === 'MOT-003')!;
    const alternator = state.items.find((item) => item.id === 'ALT-011')!;
    expect(engine.commercialState).toBe('AVAILABLE');
    expect(alternator.commercialState).toBe('AVAILABLE');
    expect(alternator.physicalRelationship).toBe('INSTALLED');
    expect(alternator.parentId).toBe('MOT-003');
  });

  it('CANCEL-002: rejects cancelling a paid or partial invoice without refund method', () => {
    const paidState = createInitialState();
    const missingPaid = cancelInvoice(paidState, admin, {
      invoiceId: 'INV-097',
      reason: 'Cliente devolvió la mercancía',
    });
    expect(missingPaid.ok).toBe(false);
    if (!missingPaid.ok) {
      expect(missingPaid.error.code).toBe('VALIDATION');
      expect(missingPaid.error.message).toBe(
        'La cancelación requiere el método del reembolso neto total',
      );
    }
    expect(paidState.invoices.find((entry) => entry.id === 'INV-097')?.status).toBe('COMPLETED');

    const withMethod = cancelInvoice(createInitialState(), admin, {
      invoiceId: 'INV-097',
      reason: 'Cliente devolvió la mercancía',
      refundAmount: 0,
      refundMethod: 'CASH',
    });
    expect(withMethod.ok).toBe(true);

    const missingPartial = cancelInvoice(createInitialState(), admin, {
      invoiceId: 'INV-099',
      reason: 'Devolución',
    });
    expect(missingPartial.ok).toBe(false);
  });

  it('CANCEL-002: records a refund equal to paid when cancelling a paid invoice', () => {
    const state = createInitialState();
    const result = cancelInvoice(state, admin, {
      invoiceId: 'INV-097',
      reason: 'Cliente devolvió la mercancía',
      refundAmount: 5_500,
      refundMethod: 'CASH',
    });

    expect(result.ok).toBe(true);
    const invoice = state.invoices.find((entry) => entry.id === 'INV-097')!;
    expect(invoice.status).toBe('CANCELLED');
    expect(
      invoice.payments.some((payment) => payment.kind === 'REFUND' && payment.amount === 5_500),
    ).toBe(true);
  });

  it('CANCEL-002: cancels an unpaid completed invoice with only a reason', () => {
    const state = createInitialState();
    const result = cancelInvoice(state, admin, {
      invoiceId: 'INV-098',
      reason: 'Cliente desistió',
    });

    expect(result.ok).toBe(true);
    const invoice = state.invoices.find((entry) => entry.id === 'INV-098')!;
    expect(invoice.status).toBe('CANCELLED');
    expect(invoice.payments.some((payment) => payment.kind === 'REFUND')).toBe(false);
  });

  it('CANCEL-005: CONTINUE then resale reuses the WO without dropping the cancelled invoice link', () => {
    const state = createInitialState();
    expect(
      cancelInvoice(state, admin, {
        invoiceId: 'INV-096',
        reason: 'Sigue el desarme',
        inProgressDecision: 'CONTINUE',
      }).ok,
    ).toBe(true);

    const created = createDraft(state, seller);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const draftId = created.value.draftId;
    expect(addDraftLine(state, seller, { draftId, type: 'ITEM', itemId: 'TUR-009' }).ok).toBe(true);
    const lineId = state.invoices.find((entry) => entry.id === draftId)!.lines[0]!.id;
    expect(setDraftLinePrice(state, seller, { draftId, lineId, unitPrice: 85_000 }).ok).toBe(true);
    expect(setDraftMeta(state, seller, { draftId, customerId: 'C1' }).ok).toBe(true);
    expect(confirmInvoice(state, seller, draftId).ok).toBe(true);

    const wo = state.workOrders.find((order) => order.id === 'OD-DEMO-060')!;
    expect(wo.invoiceId).toBe(draftId);
    expect(wo.linkedInvoiceIds).toEqual(['INV-096', draftId]);

    const cancelled = state.invoices.find((entry) => entry.id === 'INV-096')!;
    expect(
      buildInvoiceDetail(state, cancelled, admin).linkedWorkOrders.map((order) => order.id),
    ).toEqual(['OD-DEMO-060']);
  });

  it('leaves a completed dismantling independent and the parent incomplete', () => {
    const state = createInitialState();
    const wo = state.workOrders.find((order) => order.id === 'OD-DEMO-061')!;
    wo.status = 'COMPLETED';

    const result = cancelInvoice(state, admin, { invoiceId: 'INV-098', reason: 'Post desarme' });
    expect(result.ok).toBe(true);

    const piece = state.items.find((item) => item.id === 'ARR-002')!;
    expect(piece.commercialState).toBe('AVAILABLE');
    expect(piece.physicalRelationship).toBe('INDEPENDENT');
    expect(piece.parentId).toBeUndefined();
    expect(wo.status).toBe('COMPLETED');
  });
});

describe('correctCurrency', () => {
  it('corrects a completed unpaid invoice without converting amounts', () => {
    const state = createInitialState();
    const result = correctCurrency(state, admin, {
      invoiceId: 'INV-098',
      currency: 'USD',
      reason: 'Moneda elegida por error',
    });

    expect(result.ok).toBe(true);
    const invoice = state.invoices.find((entry) => entry.id === 'INV-098')!;
    expect(invoice.currency).toBe('USD');
    expect(invoiceTotal(invoice)).toBe(19_500);
    expect(invoice.profitabilityPendingFx).toBe(true);
  });

  it('rejects currency correction after payments exist', () => {
    const result = correctCurrency(createInitialState(), admin, {
      invoiceId: 'INV-099',
      currency: 'USD',
      reason: 'No aplica',
    });
    expect(result.ok).toBe(false);
  });

  it('invalidates administrator-recorded profit when correcting currency', () => {
    const state = createInitialState();
    const invoice = state.invoices.find((entry) => entry.id === 'INV-097')!;
    invoice.payments = [];
    invoice.paymentState = 'UNPAID';

    const recorded = recordManualGrossProfit(state, admin, {
      invoiceId: invoice.id,
      profitDop: 1_250,
    });
    expect(recorded.ok).toBe(true);

    const corrected = correctCurrency(state, admin, {
      invoiceId: invoice.id,
      currency: 'USD',
      reason: 'Moneda elegida por error',
    });

    expect(corrected.ok).toBe(true);
    expect(invoice.manualGrossProfitDop).toBeUndefined();
    expect(invoice.manualGrossProfitAt).toBeUndefined();
    const event = [...state.events]
      .reverse()
      .find((entry) => entry.type === 'INVOICE_CURRENCY_CORRECTED');
    expect(event?.metadata).toMatchObject({
      manualGrossProfitDopBefore: 1_250,
      manualGrossProfitInvalidated: true,
    });
  });
});
