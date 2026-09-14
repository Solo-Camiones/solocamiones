import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../../../src/mocks/data/seed';
import {
  addDraftLine,
  cancelInvoice,
  confirmInvoice,
  createDraft,
  discardDraft,
  setDraftLinePrice,
  setDraftMeta,
} from '../../../../src/mocks/services/sales-commands';
import { buildInvoiceDetail } from '../../../../src/mocks/services/sales-catalog';
import { invoiceBalance, invoiceItbis, invoiceTotal } from '../../../../src/mocks/services/invoice-money';
import { invoiceProfitDop, lineCostDop } from '../../../../src/mocks/services/gross-profit';

const seller = createInitialState().users.find((user) => user.id === 'U-LAURA')!;
const admin = createInitialState().users.find((user) => user.id === 'U-ADMIN')!;

describe('POS draft commands', () => {
  it('confirms the seed draft as FAC-000100 and opens a pending dismantling WO', () => {
    const state = createInitialState();
    const result = confirmInvoice(state, seller, 'INV-DRAFT-01');

    expect(result.ok).toBe(true);
    const invoice = state.invoices.find((entry) => entry.id === 'INV-DRAFT-01')!;
    expect(invoice.status).toBe('COMPLETED');
    expect(invoice.number).toBe('FAC-000100');
    expect(invoice.paymentState).toBe('UNPAID');
    expect(invoice.payments).toHaveLength(0);
    expect(state.facSeq).toBe(101);

    const alternator = state.items.find((item) => item.id === 'ALT-004')!;
    expect(alternator.commercialState).toBe('SOLD');
    expect(alternator.physicalRelationship).toBe('INSTALLED');
    expect(alternator.parentId).toBe('MOT-001');
    expect(alternator.reservedByDraftId).toBeUndefined();

    const oil = state.qtyProducts.find((product) => product.id === 'QTY-OIL-15W40')!;
    expect(oil.onHand).toBe(46);
    expect(oil.reserved).toBe(0);

    const wo = state.workOrders.find((order) => order.id === 'OD-DEMO-064');
    expect(wo).toMatchObject({
      type: 'DISMANTLING',
      status: 'PENDING',
      pieceId: 'ALT-004',
      invoiceId: 'INV-DRAFT-01',
      linkedInvoiceIds: ['INV-DRAFT-01'],
    });
  });

  it('is idempotent: a second confirm does not consume another FAC number', () => {
    const state = createInitialState();
    expect(confirmInvoice(state, seller, 'INV-DRAFT-01').ok).toBe(true);
    const second = confirmInvoice(state, seller, 'INV-DRAFT-01');

    expect(second.ok).toBe(true);
    expect(state.invoices.filter((entry) => entry.number === 'FAC-000100')).toHaveLength(1);
    expect(state.invoices.some((entry) => entry.number === 'FAC-000101')).toBe(false);
    expect(state.facSeq).toBe(101);
  });

  it('keeps ITBIS at 0 without fiscal flag and extracts included ITBIS when enabled', () => {
    const state = createInitialState();
    const draft = state.invoices.find((entry) => entry.id === 'INV-DRAFT-01')!;

    expect(invoiceTotal(draft)).toBe(31_600);
    expect(invoiceItbis(draft)).toBe(0);

    const fiscal = setDraftMeta(state, seller, { draftId: 'INV-DRAFT-01', fiscal: true });
    expect(fiscal.ok).toBe(true);
    expect(invoiceTotal(draft)).toBe(31_600);
    expect(invoiceItbis(draft)).toBeGreaterThan(0);
  });

  it('rejects fiscal mode on Cliente Contado', () => {
    const state = createInitialState();
    const created = createDraft(state, seller);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const result = setDraftMeta(state, seller, { draftId: created.value.draftId, fiscal: true });
    expect(result.ok).toBe(false);
  });

  it('rejects a No desarmar descendant as a loose line', () => {
    const state = createInitialState();
    const result = addDraftLine(state, seller, {
      draftId: 'INV-DRAFT-01',
      type: 'ITEM',
      itemId: 'ALT-011',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('MOT-003');
    }
  });

  it('rejects an item reserved by another draft', () => {
    const state = createInitialState();
    const created = createDraft(state, seller);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    expect(
      addDraftLine(state, seller, {
        draftId: created.value.draftId,
        type: 'ITEM',
        itemId: 'FIL-001',
      }).ok,
    ).toBe(true);

    const conflict = addDraftLine(state, seller, {
      draftId: 'INV-DRAFT-01',
      type: 'ITEM',
      itemId: 'FIL-001',
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.error.code).toBe('CONFLICT');
    }
  });

  it('blocks confirmation while prices are pending', () => {
    const state = createInitialState();
    expect(
      addDraftLine(state, seller, {
        draftId: 'INV-DRAFT-01',
        type: 'ITEM',
        itemId: 'FIL-001',
      }).ok,
    ).toBe(true);

    const result = confirmInvoice(state, seller, 'INV-DRAFT-01');
    expect(result.ok).toBe(false);
    expect(state.invoices.find((entry) => entry.id === 'INV-DRAFT-01')?.status).toBe('DRAFT');
  });

  it('blocks confirming an assembly with active work in the subtree', () => {
    const state = createInitialState();
    const created = createDraft(state, seller);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const draftId = created.value.draftId;

    const added = addDraftLine(state, seller, { draftId, type: 'ITEM', itemId: 'MOT-002' });
    expect(added.ok).toBe(true);
    expect(setDraftLinePrice(state, seller, { draftId, lineId: 'L-D1', unitPrice: 50_000 }).ok).toBe(
      true,
    );

    const result = confirmInvoice(state, seller, draftId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('OD-DEMO-062');
    }
    expect(state.items.find((item) => item.id === 'MOT-002')?.commercialState).toBe('AVAILABLE');
  });

  it('creates a dismantling WO when confirming installed assembly MOT-001', () => {
    const state = createInitialState();
    const created = createDraft(state, seller);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    delete state.items.find((item) => item.id === 'ALT-004')!.reservedByDraftId;
    for (const order of state.workOrders) {
      if (order.pieceId === 'TUR-009' || order.pieceId === 'ARR-002') {
        order.status = 'COMPLETED';
      }
    }
    // SALE-008: included descendants must not already be Sold at confirmation.
    for (const descendantId of ['TUR-009', 'ARR-002'] as const) {
      state.items.find((item) => item.id === descendantId)!.commercialState = 'AVAILABLE';
    }

    const draftId = created.value.draftId;
    expect(addDraftLine(state, seller, { draftId, type: 'ITEM', itemId: 'MOT-001' }).ok).toBe(true);
    const lineId = state.invoices.find((entry) => entry.id === draftId)!.lines[0]!.id;
    expect(setDraftLinePrice(state, seller, { draftId, lineId, unitPrice: 200_000 }).ok).toBe(true);

    const truckCompleteBefore = state.items.find((item) => item.id === 'CAM-001')!.complete;
    expect(setDraftMeta(state, seller, { draftId, customerId: 'C1' }).ok).toBe(true);
    const result = confirmInvoice(state, seller, draftId);

    expect(result.ok).toBe(true);
    const engine = state.items.find((item) => item.id === 'MOT-001')!;
    expect(engine.commercialState).toBe('SOLD');
    expect(engine.physicalRelationship).toBe('INSTALLED');
    expect(engine.parentId).toBe('CAM-001');

    const dismantling = state.workOrders.find(
      (order) =>
        order.pieceId === 'MOT-001' &&
        order.type === 'DISMANTLING' &&
        (order.status === 'PENDING' || order.status === 'IN_PROGRESS'),
    );
    expect(dismantling).toMatchObject({ invoiceId: draftId });
    expect(state.items.find((item) => item.id === 'CAM-001')!.complete).toBe(truckCompleteBefore);
  });

  it('does not create a dismantling WO when confirming an independent assembly', () => {
    const state = createInitialState();
    const created = createDraft(state, seller);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const draftId = created.value.draftId;
    expect(addDraftLine(state, seller, { draftId, type: 'ITEM', itemId: 'MOT-003' }).ok).toBe(true);
    const lineId = state.invoices.find((entry) => entry.id === draftId)!.lines[0]!.id;
    expect(setDraftLinePrice(state, seller, { draftId, lineId, unitPrice: 150_000 }).ok).toBe(true);

    const woCountBefore = state.workOrders.filter(
      (order) => order.type === 'DISMANTLING' && order.pieceId === 'MOT-003',
    ).length;
    expect(setDraftMeta(state, seller, { draftId, customerId: 'C1' }).ok).toBe(true);
    const result = confirmInvoice(state, seller, draftId);

    expect(result.ok).toBe(true);
    expect(state.items.find((item) => item.id === 'MOT-003')?.commercialState).toBe('SOLD');
    expect(state.items.find((item) => item.id === 'MOT-003')?.physicalRelationship).toBe('INDEPENDENT');
    expect(
      state.workOrders.filter((order) => order.type === 'DISMANTLING' && order.pieceId === 'MOT-003'),
    ).toHaveLength(woCountBefore);
  });

  it('SALE-008: freezes the delivered assembly tree so later parentId edits do not rewrite the snapshot', () => {
    const state = createInitialState();
    const created = createDraft(state, seller);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const draftId = created.value.draftId;
    expect(addDraftLine(state, seller, { draftId, type: 'ITEM', itemId: 'MOT-003' }).ok).toBe(true);
    const lineId = state.invoices.find((entry) => entry.id === draftId)!.lines[0]!.id;
    expect(setDraftLinePrice(state, seller, { draftId, lineId, unitPrice: 150_000 }).ok).toBe(true);

    expect(setDraftMeta(state, seller, { draftId, customerId: 'C1' }).ok).toBe(true);
    const result = confirmInvoice(state, seller, draftId);
    expect(result.ok).toBe(true);

    const invoice = state.invoices.find((entry) => entry.id === draftId)!;
    const delivered = invoice.deliveredAssemblies?.find((entry) => entry.rootItemId === 'MOT-003');
    expect(delivered).toBeDefined();
    expect(delivered!.nodes.map((node) => node.itemId)).toEqual(
      expect.arrayContaining(['MOT-003', 'ALT-011']),
    );
    expect(delivered!.nodes.find((node) => node.itemId === 'ALT-011')?.parentId).toBe('MOT-003');

    state.items.find((item) => item.id === 'ALT-011')!.parentId = 'MOT-002';

    expect(invoice.deliveredAssemblies!.find((entry) => entry.rootItemId === 'MOT-003')!.nodes.find(
      (node) => node.itemId === 'ALT-011',
    )?.parentId).toBe('MOT-003');

    const detail = buildInvoiceDetail(state, invoice, admin);
    expect(detail.deliveredAssemblies?.find((entry) => entry.rootItemId === 'MOT-003')?.nodes.find(
      (node) => node.itemId === 'ALT-011',
    )?.parentId).toBe('MOT-003');
  });

  it('rejects confirming an assembly whose descendant is already Sold', () => {
    const state = createInitialState();
    const alternator = state.items.find((item) => item.id === 'ALT-011')!;
    alternator.commercialState = 'SOLD';

    const created = createDraft(state, seller);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const draftId = created.value.draftId;
    expect(addDraftLine(state, seller, { draftId, type: 'ITEM', itemId: 'MOT-003' }).ok).toBe(true);
    const lineId = state.invoices.find((entry) => entry.id === draftId)!.lines[0]!.id;
    expect(setDraftLinePrice(state, seller, { draftId, lineId, unitPrice: 150_000 }).ok).toBe(true);

    const facSeqBefore = state.facSeq;
    const result = confirmInvoice(state, seller, draftId);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
      expect(result.error.message).toContain('ALT-011');
    }
    expect(state.items.find((item) => item.id === 'MOT-003')?.commercialState).toBe('AVAILABLE');
    expect(state.facSeq).toBe(facSeqBefore);
    expect(state.invoices.find((entry) => entry.id === draftId)?.status).toBe('DRAFT');
  });

  it('blocks confirming MOT-001 while descendant dismantling is active', () => {
    const state = createInitialState();
    expect(
      addDraftLine(state, seller, {
        draftId: 'INV-DRAFT-01',
        type: 'ITEM',
        itemId: 'MOT-001',
      }).ok,
    ).toBe(false);

    const created = createDraft(state, seller);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    delete state.items.find((item) => item.id === 'ALT-004')!.reservedByDraftId;
    const draftId = created.value.draftId;
    expect(addDraftLine(state, seller, { draftId, type: 'ITEM', itemId: 'MOT-001' }).ok).toBe(true);
    const lineId = state.invoices.find((entry) => entry.id === draftId)!.lines[0]!.id;
    expect(setDraftLinePrice(state, seller, { draftId, lineId, unitPrice: 200_000 }).ok).toBe(true);

    const result = confirmInvoice(state, seller, draftId);
    expect(result.ok).toBe(false);
  });

  it('preserves the customer snapshot after the live customer is edited', () => {
    const state = createInitialState();
    expect(confirmInvoice(state, seller, 'INV-DRAFT-01').ok).toBe(true);

    const customer = state.customers.find((entry) => entry.id === 'C1')!;
    customer.name = 'Nombre cambiado';

    const invoice = state.invoices.find((entry) => entry.id === 'INV-DRAFT-01')!;
    const detail = buildInvoiceDetail(state, invoice, admin);
    expect(detail.customerName).toBe('Transportes del Caribe SRL');
    expect(invoice.customerSnapshot?.name).toBe('Transportes del Caribe SRL');
  });

  it('stores QTY acquisitionCostDop from unitCostDop on a new line', () => {
    const state = createInitialState();
    const created = createDraft(state, seller);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const product = state.qtyProducts.find((entry) => entry.id === 'QTY-OIL-15W40')!;
    const unitCostDop = product.unitCostDop;
    const draftId = created.value.draftId;
    const added = addDraftLine(state, seller, {
      draftId,
      type: 'QTY',
      qtyProductId: product.id,
      quantity: 1,
      unitPrice: 1_800,
    });

    expect(added.ok).toBe(true);
    const line = state.invoices.find((entry) => entry.id === draftId)!.lines[0]!;
    expect(line.type).toBe('QTY');
    expect(line.acquisitionCostDop).toBe(unitCostDop);

    product.unitCostDop = unitCostDop + 500;
    expect(
      addDraftLine(state, seller, {
        draftId,
        type: 'QTY',
        qtyProductId: product.id,
        quantity: 1,
        unitPrice: 1_800,
      }).ok,
    ).toBe(true);
    expect(line.quantity).toBe(2);
    expect(line.acquisitionCostDop).toBe(unitCostDop);
  });

  it('does not partially edit a line when a later field is invalid', () => {
    const state = createInitialState();
    const created = createDraft(state, seller);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const draftId = created.value.draftId;
    expect(
      addDraftLine(state, seller, {
        draftId,
        type: 'GENERIC',
        description: 'Filtro',
        notes: 'Original',
        quantity: 1,
        unitPrice: 100,
      }).ok,
    ).toBe(true);
    const line = state.invoices.find((entry) => entry.id === draftId)!.lines[0]!;

    const result = setDraftLinePrice(state, seller, {
      draftId,
      lineId: line.id,
      unitPrice: 125,
      quantity: 3,
      description: 'Filtro de aire',
      notes: 'Modificada',
      acquisitionCostDop: Number.NaN,
    });

    expect(result.ok).toBe(false);
    expect(line).toMatchObject({
      description: 'Filtro',
      notes: 'Original',
      quantity: 1,
      unitPrice: 100,
    });
    expect(line.acquisitionCostDop).toBeUndefined();
  });

  it('freezes line acquisitionCostDop on confirm so later live cost edits do not change profit', () => {
    const state = createInitialState();
    expect(confirmInvoice(state, seller, 'INV-DRAFT-01').ok).toBe(true);

    const invoice = state.invoices.find((entry) => entry.id === 'INV-DRAFT-01')!;
    const itemLine = invoice.lines.find((line) => line.type === 'ITEM')!;
    const qtyLine = invoice.lines.find((line) => line.type === 'QTY')!;
    expect(itemLine.acquisitionCostDop).toBe(18_500);
    expect(qtyLine.acquisitionCostDop).toBe(1_250);

    const frozenItemCost = lineCostDop(itemLine, state);
    const frozenQtyCost = lineCostDop(qtyLine, state);
    const frozenProfit = invoiceProfitDop(invoice, state);
    expect(frozenItemCost).toBe(18_500);
    expect(frozenQtyCost).toBe(2_500);
    expect(frozenProfit).toBe(10_600);

    state.items.find((item) => item.id === 'ALT-004')!.acquisitionCostDop = 999_999;
    state.qtyProducts.find((product) => product.id === 'QTY-OIL-15W40')!.unitCostDop = 1;

    expect(lineCostDop(itemLine, state)).toBe(frozenItemCost);
    expect(lineCostDop(qtyLine, state)).toBe(frozenQtyCost);
    expect(invoiceProfitDop(invoice, state)).toBe(frozenProfit);
  });

  it('CANCEL-005: reuses an in-progress dismantling WO and keeps the cancelled invoice linked', () => {
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
    expect(wo.status).toBe('IN_PROGRESS');
    expect(wo.invoiceId).toBe(draftId);
    expect(wo.linkedInvoiceIds).toEqual(['INV-096', draftId]);
    expect(
      state.workOrders.filter((order) => order.type === 'DISMANTLING' && order.pieceId === 'TUR-009'),
    ).toHaveLength(1);

    const cancelled = state.invoices.find((entry) => entry.id === 'INV-096')!;
    const resale = state.invoices.find((entry) => entry.id === draftId)!;
    expect(buildInvoiceDetail(state, cancelled, admin).linkedWorkOrders.map((order) => order.id)).toContain(
      'OD-DEMO-060',
    );
    expect(buildInvoiceDetail(state, resale, admin).linkedWorkOrders.map((order) => order.id)).toContain(
      'OD-DEMO-060',
    );
  });

  it('releases reservations when a draft is discarded', () => {
    const state = createInitialState();
    expect(discardDraft(state, seller, 'INV-DRAFT-01').ok).toBe(true);

    expect(state.invoices.some((entry) => entry.id === 'INV-DRAFT-01')).toBe(false);
    expect(state.items.find((item) => item.id === 'ALT-004')?.reservedByDraftId).toBeUndefined();
    expect(state.qtyProducts.find((product) => product.id === 'QTY-OIL-15W40')?.reserved).toBe(0);
  });

  it('PAY-001: confirms with full payment as PAID and one PAYMENT row', () => {
    const state = createInitialState();
    const total = invoiceTotal(state.invoices.find((entry) => entry.id === 'INV-DRAFT-01')!);
    const result = confirmInvoice(state, seller, 'INV-DRAFT-01', {
      amount: total,
      method: 'CASH',
    });

    expect(result.ok).toBe(true);
    const invoice = state.invoices.find((entry) => entry.id === 'INV-DRAFT-01')!;
    expect(invoice.status).toBe('COMPLETED');
    expect(invoice.paymentState).toBe('PAID');
    expect(invoice.payments).toHaveLength(1);
    expect(invoice.payments[0]).toMatchObject({ kind: 'PAYMENT', amount: total, method: 'CASH' });
    expect(invoiceBalance(invoice)).toBe(0);
  });

  it('PAY-001: rejects overpay before consuming FAC- or inventory', () => {
    const state = createInitialState();
    const facSeqBefore = state.facSeq;
    const oil = state.qtyProducts.find((product) => product.id === 'QTY-OIL-15W40')!;
    const onHandBefore = oil.onHand;
    const reservedBefore = oil.reserved;
    const total = invoiceTotal(state.invoices.find((entry) => entry.id === 'INV-DRAFT-01')!);

    const result = confirmInvoice(state, seller, 'INV-DRAFT-01', {
      amount: total + 1,
      method: 'TRANSFER',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
    expect(state.facSeq).toBe(facSeqBefore);
    expect(state.invoices.find((entry) => entry.id === 'INV-DRAFT-01')?.status).toBe('DRAFT');
    expect(state.items.find((item) => item.id === 'ALT-004')?.commercialState).toBe('AVAILABLE');
    expect(state.items.find((item) => item.id === 'ALT-004')?.reservedByDraftId).toBe('INV-DRAFT-01');
    expect(state.qtyProducts.find((product) => product.id === 'QTY-OIL-15W40')).toMatchObject({
      onHand: onHandBefore,
      reserved: reservedBefore,
    });
  });

  it('PAY-001: confirms with a partial initial payment as PARTIALLY_PAID', () => {
    const state = createInitialState();
    const total = invoiceTotal(state.invoices.find((entry) => entry.id === 'INV-DRAFT-01')!);
    const partial = 10_000;
    const result = confirmInvoice(state, seller, 'INV-DRAFT-01', {
      amount: partial,
      method: 'CARD',
      reference: 'POS-001',
    });

    expect(result.ok).toBe(true);
    const invoice = state.invoices.find((entry) => entry.id === 'INV-DRAFT-01')!;
    expect(invoice.status).toBe('COMPLETED');
    expect(invoice.paymentState).toBe('PARTIALLY_PAID');
    expect(invoice.payments).toEqual([
      expect.objectContaining({
        kind: 'PAYMENT',
        amount: partial,
        method: 'CARD',
        reference: 'POS-001',
      }),
    ]);
    expect(invoiceBalance(invoice)).toBe(total - partial);
  });

  it('rejects confirming Cliente contado unless the initial payment covers the total', () => {
    const state = createInitialState();
    const created = createDraft(state, seller);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const draftId = created.value.draftId;
    expect(
      addDraftLine(state, seller, {
        draftId,
        type: 'GENERIC',
        description: 'Filtro',
        quantity: 1,
        unitPrice: 100,
      }).ok,
    ).toBe(true);

    const unpaid = confirmInvoice(state, seller, draftId);
    expect(unpaid.ok).toBe(false);
    if (!unpaid.ok) {
      expect(unpaid.error.message).toBe('A Cliente contado no se le puede vender a crédito');
    }

    const partial = confirmInvoice(state, seller, draftId, { amount: 40, method: 'CASH' });
    expect(partial.ok).toBe(false);

    const paid = confirmInvoice(state, seller, draftId, { amount: 100, method: 'CASH' });
    expect(paid.ok).toBe(true);
    expect(state.invoices.find((entry) => entry.id === draftId)?.paymentState).toBe('PAID');
  });
});
