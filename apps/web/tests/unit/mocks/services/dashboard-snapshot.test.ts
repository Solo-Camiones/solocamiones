import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../../../src/mocks/data/seed';
import { backfillPendingExpectedComponents } from '../../../../src/mocks/services/catalogs-reviews';
import { invoiceProfitDop } from '../../../../src/mocks/services/gross-profit';
import {
  invoiceBalance,
  invoiceTaxableBase,
  invoiceTotal,
  lineItbis,
} from '../../../../src/mocks/services/invoice-money';
import { buildDashboardSnapshot } from '../../../../src/mocks/services/dashboard-snapshot';

const DEMO_DAY = '2026-08-25T16:00:00.000Z';

describe('invoice-money', () => {
  it('keeps ITBIS at 0 when the invoice is not fiscal', () => {
    const state = createInitialState();
    const invoice = state.invoices.find((entry) => entry.id === 'INV-099');
    expect(invoice).toBeDefined();
    expect(invoiceTotal(invoice!)).toBe(7200);
    expect(invoiceTaxableBase(invoice!)).toBe(7200);
    expect(lineItbis(invoice!.lines[0], invoice!.fiscal)).toBe(0);
    expect(invoiceBalance(invoice!)).toBe(3600);
  });

  it('extracts included 18% ITBIS on fiscal taxable lines without changing the gross total', () => {
    const state = createInitialState();
    const invoice = state.invoices.find((entry) => entry.id === 'INV-098');
    expect(invoice).toBeDefined();
    expect(invoiceTotal(invoice!)).toBe(19500);
    expect(lineItbis(invoice!.lines[0], true)).toBe(2974.58);
    expect(invoiceBalance(invoice!)).toBe(19500);
  });

  it('treats PAID invoices as zero balance even without payment rows', () => {
    const state = createInitialState();
    const invoice = state.invoices.find((entry) => entry.id === 'INV-096');
    expect(invoiceBalance(invoice!)).toBe(0);
  });
});

describe('buildDashboardSnapshot', () => {
  it('matches seed aggregates after reset for Administrator', () => {
    const snapshot = buildDashboardSnapshot(createInitialState(), {
      nowIso: DEMO_DAY,
      includeProfitability: true,
      includeWorkOrderQueue: true,
    });

    expect(snapshot.kpis).toEqual({
      availableInventory: 78,
      invoicesToday: 2,
      outstandingDop: 23100,
      outstandingUsd: 0,
      draftCount: 1,
      pendingDismantling: 1,
      workOrdersInProgress: 1,
      incompleteAssemblies: 2,
      profitDop: 8900,
      pendingFx: 1,
    });

    expect(snapshot.recentInvoices[0]?.number).toBe('FAC-000099');
    expect(snapshot.activity[0]).toMatchObject({
      id: 'EV-003',
      actorName: 'Laura Pérez',
    });
  });

  it('omits profitability fields for Seller projections', () => {
    const snapshot = buildDashboardSnapshot(createInitialState(), {
      nowIso: DEMO_DAY,
      includeProfitability: false,
    });

    expect(snapshot.kpis.profitDop).toBeUndefined();
    expect(snapshot.kpis.pendingFx).toBeUndefined();
    expect(snapshot.kpis.pendingDismantling).toBeUndefined();
    expect(snapshot.kpis.workOrdersInProgress).toBeUndefined();
    expect(snapshot.kpis.draftCount).toBe(1);
    expect(snapshot.kpis.availableInventory).toBe(78);
  });

  it('includes catalog-review alerts only when admin alerts are requested', () => {
    const state = createInitialState();
    const admin = state.users[0]!;
    const engine = state.categories.find((category) => category.id === 'CAT-ENG')!;
    backfillPendingExpectedComponents(state, admin, engine, ['Bomba de aceite']);

    const adminSnapshot = buildDashboardSnapshot(state, {
      nowIso: DEMO_DAY,
      includeProfitability: true,
      includeAdminAlerts: true,
      includeWorkOrderQueue: true,
    });
    const sellerSnapshot = buildDashboardSnapshot(state, {
      nowIso: DEMO_DAY,
      includeProfitability: false,
    });

    expect(adminSnapshot.pendingCatalogReviews).toHaveLength(3);
    expect(adminSnapshot.pendingCatalogReviews?.every((row) => row.kind === 'PENDING_NA')).toBe(true);
    expect(adminSnapshot.kpis.pendingCatalogValidations).toBe(3);
    expect(adminSnapshot.pendingCatalogReviews?.some((row) => row.itemId === 'MOT-001')).toBe(true);
    expect(sellerSnapshot.pendingCatalogReviews).toBeUndefined();
    expect(sellerSnapshot.kpis.pendingCatalogValidations).toBeUndefined();
  });

  it('skips invoices with unknown cost instead of inventing profit', () => {
    const state = createInitialState();
    const generic = state.invoices.find((entry) => entry.id === 'INV-097');
    expect(invoiceProfitDop(generic!, state)).toBeNull();
  });
});
