import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mockSalesRepository } from '../../../../src/mocks/repositories/MockSalesRepository';
import { getMockState, resetMockState } from '../../../../src/mocks/state';
import { signInAs } from '../../../support/session';

describe('MockSalesRepository', () => {
  beforeEach(() => {
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('lists seed invoices for seller and admin', async () => {
    signInAs('SELLER');
    const listed = await mockSalesRepository.listInvoices();

    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(
        listed.value.items.some((row) => row.number === 'FAC-000098' && row.paymentState === 'UNPAID'),
      ).toBe(true);
      expect(
        listed.value.items.some(
          (row) => row.number === 'FAC-000099' && row.paymentState === 'PARTIALLY_PAID',
        ),
      ).toBe(true);
    }
  });

  it('lists open receivables grouped by customer and currency', async () => {
    signInAs('SELLER');
    const receivables = await mockSalesRepository.listReceivables();

    expect(receivables.ok).toBe(true);
    if (!receivables.ok) return;
    expect(receivables.value.invoices.every((row) => row.balance > 0)).toBe(true);
    expect(receivables.value.invoices.some((row) => row.number === 'FAC-000098')).toBe(true);
    expect(receivables.value.customers.every((row) => row.balance > 0)).toBe(true);
    const currencies = new Set(
      receivables.value.customers.map((row) => `${row.customerId}:${row.currency}`),
    );
    expect(currencies.size).toBe(receivables.value.customers.length);
  });

  it('persists a payment and returns the updated detail', async () => {
    signInAs('SELLER');
    const paid = await mockSalesRepository.addPayment({
      invoiceId: 'INV-098',
      amount: 19_500,
      method: 'CASH',
      effectiveDate: '2026-09-09',
    });
    const loaded = await mockSalesRepository.getInvoice('INV-098');

    expect(paid.ok && paid.value.paymentState).toBe('PAID');
    expect(loaded.ok && loaded.value.balance).toBe(0);
    expect(getMockState().invoices.find((entry) => entry.id === 'INV-098')?.payments).toHaveLength(
      1,
    );
  });

  it('denies cancellation and currency correction to the seller', async () => {
    signInAs('SELLER');

    const cancelled = await mockSalesRepository.cancelInvoice({
      invoiceId: 'INV-097',
      reason: 'No debería',
    });
    const corrected = await mockSalesRepository.correctCurrency({
      invoiceId: 'INV-098',
      currency: 'USD',
      reason: 'No debería',
    });

    expect(cancelled.ok).toBe(false);
    expect(corrected.ok).toBe(false);
    if (!cancelled.ok) {
      expect(cancelled.error.code).toBe('FORBIDDEN');
    }
  });

  it('cancels as administrator and keeps the original document', async () => {
    signInAs('ADMINISTRATOR');
    const result = await mockSalesRepository.cancelInvoice({
      invoiceId: 'INV-097',
      reason: 'Cliente devolvió la mercancía',
      refundAmount: 5_500,
      refundMethod: 'CASH',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('CANCELLED');
      expect(result.value.cancelReason).toBe('Cliente devolvió la mercancía');
      expect(result.value.number).toBe('FAC-000097');
    }
  });

  it('denies mechanic access', async () => {
    signInAs('MECHANIC');
    const result = await mockSalesRepository.listInvoices();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('confirms the seed draft and exposes FAC-000100 in the completed list', async () => {
    signInAs('SELLER');
    const confirmed = await mockSalesRepository.confirmInvoice('INV-DRAFT-01');
    const listed = await mockSalesRepository.listInvoices('COMPLETED');
    const detail = await mockSalesRepository.getInvoice('INV-DRAFT-01');

    expect(confirmed.ok && confirmed.value.number).toBe('FAC-000100');
    expect(listed.ok && listed.value.items.some((row) => row.number === 'FAC-000100')).toBe(true);
    expect(detail.ok && detail.value.status).toBe('COMPLETED');
    expect(detail.ok && detail.value.actions.canPay).toBe(true);
    expect(detail.ok && detail.value.paymentState).toBe('UNPAID');
  });

  it('confirms the seed draft with a full initial payment', async () => {
    signInAs('SELLER');
    const confirmed = await mockSalesRepository.confirmInvoice('INV-DRAFT-01', {
      amount: 31_600,
      method: 'CASH',
    });
    const detail = await mockSalesRepository.getInvoice('INV-DRAFT-01');

    expect(confirmed.ok && confirmed.value.number).toBe('FAC-000100');
    expect(detail.ok && detail.value.paymentState).toBe('PAID');
    expect(detail.ok && detail.value.balance).toBe(0);
    expect(detail.ok && detail.value.payments).toHaveLength(1);
  });

  it('opens a second draft without reusing the seed draft', async () => {
    signInAs('SELLER');
    const created = await mockSalesRepository.createDraft();

    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.draftId).toBe('INV-DRAFT-02');
    }
    expect(getMockState().invoices.filter((entry) => entry.status === 'DRAFT')).toHaveLength(2);
  });
});
