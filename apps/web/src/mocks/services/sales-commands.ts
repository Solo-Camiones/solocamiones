import type {
  AddPaymentInput,
  CancelInvoiceInput,
  CorrectCurrencyInput,
  InProgressCancelDecision,
} from '../../api/contracts/sales';
import type {
  AppEvent,
  AppState,
  Invoice,
  Item,
  Payment,
  User,
  WorkOrder,
} from '../../api/contracts/entities';
import { err, ok, type Result } from '../../shared/auth/types';
import { DEMO_NOW_ISO } from '../data/demo-clock';
import {
  collectSubtree,
  isAssemblyItem,
  itemById,
  syncDirectParentCompleteness,
} from './inventory-helpers';
import { applyUsdProfitability } from './usd-profitability';
import {
  derivePaymentState,
  hasRecordedReceipts,
  invoiceBalance,
  invoicePaid,
  invoiceRefunded,
  roundMoney,
} from './invoice-money';

function nextNumericId(ids: string[], prefix: string, pad: number): string {
  let max = 0;
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);

  for (const id of ids) {
    const match = pattern.exec(id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  return `${prefix}${String(max + 1).padStart(pad, '0')}`;
}

function allPaymentIds(state: AppState): string[] {
  return state.invoices.flatMap((invoice) => invoice.payments.map((payment) => payment.id));
}

function appendEvent(
  state: AppState,
  type: string,
  description: string,
  actor: User,
  metadata?: Record<string, unknown>,
): AppEvent {
  const event: AppEvent = {
    id: nextNumericId(
      state.events.map((entry) => entry.id),
      'EV-',
      3,
    ),
    type,
    description,
    actorId: actor.id,
    createdAt: DEMO_NOW_ISO,
    metadata,
  };
  state.events.push(event);
  return event;
}

function findInvoice(state: AppState, invoiceId: string): Result<Invoice> {
  const invoice = state.invoices.find((entry) => entry.id === invoiceId);
  if (!invoice) {
    return err({ code: 'NOT_FOUND', message: 'Factura no encontrada' });
  }
  return ok(invoice);
}

function parsePositiveMoney(value: number | undefined): Result<number> {
  if (value == null || !Number.isFinite(value)) {
    return err({ code: 'VALIDATION', message: 'El monto debe ser un número válido' });
  }

  const rounded = roundMoney(value);
  if (rounded <= 0) {
    return err({ code: 'VALIDATION', message: 'El monto debe ser mayor que cero' });
  }

  return ok(rounded);
}

function workOrderLinkedToInvoice(order: WorkOrder, invoiceId: string): boolean {
  return order.invoiceId === invoiceId || Boolean(order.linkedInvoiceIds?.includes(invoiceId));
}

function linkedDismantlingOrders(state: AppState, invoiceId: string): WorkOrder[] {
  return state.workOrders.filter(
    (order) => order.type === 'DISMANTLING' && workOrderLinkedToInvoice(order, invoiceId),
  );
}

function restoreSoldItem(state: AppState, item: Item, woStatus: WorkOrder['status'] | undefined): void {
  if (item.commercialState !== 'SOLD') {
    return;
  }

  item.commercialState = 'AVAILABLE';

  if (woStatus === 'COMPLETED') {
    const parentId = item.parentId;
    item.physicalRelationship = 'INDEPENDENT';
    item.parentId = undefined;
    if (parentId) {
      const parent = itemById(state.items, parentId);
      if (parent) {
        syncDirectParentCompleteness(parent, state.knownMissing, state.categories);
      }
    }
  }
}

function restoreInventoryForInvoice(state: AppState, invoice: Invoice, woByPiece: Map<string, WorkOrder>): void {
  for (const line of invoice.lines) {
    if (line.itemId) {
      const item = itemById(state.items, line.itemId);
      if (item) {
        restoreSoldItem(state, item, woByPiece.get(item.id)?.status);
        // SALE-008 / CANCEL-003: confirmInvoice marks assembly descendants Sold without
        // invoice lines; restore them too. restoreSoldItem is idempotent if a descendant
        // is also a line of its own.
        if (isAssemblyItem(item, state.categories)) {
          for (const descendant of collectSubtree(state.items, item.id)) {
            restoreSoldItem(state, descendant, woByPiece.get(descendant.id)?.status);
          }
        }
      }
      continue;
    }

    if (line.qtyProductId) {
      const product = state.qtyProducts.find((entry) => entry.id === line.qtyProductId);
      if (product) {
        product.onHand += line.quantity;
      }
    }
  }
}

function applyWorkOrderBranch(
  order: WorkOrder,
  decision: InProgressCancelDecision | undefined,
): Result<void> {
  if (order.status === 'PENDING') {
    order.status = 'CANCELLED';
    return ok(undefined);
  }

  if (order.status === 'IN_PROGRESS') {
    if (decision == null) {
      return err({
        code: 'VALIDATION',
        message: 'Debe elegir si detener el desarme en proceso o continuar el trabajo físico',
      });
    }
    if (decision === 'STOP') {
      order.status = 'CANCELLED';
    }
    return ok(undefined);
  }

  return ok(undefined);
}

export function addPayment(state: AppState, actor: User, input: AddPaymentInput): Result<Invoice> {
  const found = findInvoice(state, input.invoiceId);
  if (!found.ok) {
    return found;
  }

  const invoice = found.value;

  if (invoice.status !== 'COMPLETED') {
    return err({ code: 'VALIDATION', message: 'Solo se pueden registrar pagos en facturas completadas' });
  }

  if (input.idempotencyKey) {
    const existing = invoice.payments.find((payment) => payment.idempotencyKey === input.idempotencyKey);
    if (existing) {
      return ok(invoice);
    }
  }

  const amount = parsePositiveMoney(input.amount);
  if (!amount.ok) {
    return amount;
  }

  const balance = invoiceBalance(invoice);
  if (amount.value > balance) {
    return err({
      code: 'VALIDATION',
      message: 'El pago no puede superar el saldo pendiente',
    });
  }

  const payment: Payment = {
    id: nextNumericId(allPaymentIds(state), 'PAY-', 3),
    invoiceId: invoice.id,
    amount: amount.value,
    method: input.method,
    createdAt: DEMO_NOW_ISO,
    kind: 'PAYMENT',
    actorId: actor.id,
    reference: input.reference?.trim() || undefined,
    idempotencyKey: input.idempotencyKey,
  };

  invoice.payments.push(payment);
  invoice.paymentState = derivePaymentState(invoice);

  const number = invoice.number ?? invoice.id;
  appendEvent(state, 'PAYMENT_RECORDED', `Pago registrado en ${number}`, actor, {
    invoiceId: invoice.id,
    paymentId: payment.id,
    amount: payment.amount,
    method: payment.method,
  });

  return ok(invoice);
}

export function cancelInvoice(state: AppState, actor: User, input: CancelInvoiceInput): Result<Invoice> {
  const found = findInvoice(state, input.invoiceId);
  if (!found.ok) {
    return found;
  }

  const invoice = found.value;
  const reason = input.reason.trim();

  if (invoice.status !== 'COMPLETED') {
    return err({ code: 'VALIDATION', message: 'Solo se pueden cancelar facturas completadas' });
  }

  if (!reason) {
    return err({ code: 'VALIDATION', message: 'La cancelación requiere un motivo' });
  }

  const linked = linkedDismantlingOrders(state, invoice.id);
  const inProgress = linked.filter((order) => order.status === 'IN_PROGRESS');
  if (inProgress.length > 0 && input.inProgressDecision == null) {
    return err({
      code: 'VALIDATION',
      message: 'Debe elegir si detener el desarme en proceso o continuar el trabajo físico',
    });
  }

  let refund: Payment | undefined;
  const netReceived = roundMoney(invoicePaid(invoice) - invoiceRefunded(invoice));

  // Cancellation refunds the complete net received in the same operation.
  if (netReceived > 0) {
    if (!input.refundMethod) {
      return err({
        code: 'VALIDATION',
        message: 'La cancelación requiere el método del reembolso neto total',
      });
    }

    refund = {
      id: nextNumericId(allPaymentIds(state), 'PAY-', 3),
      invoiceId: invoice.id,
      amount: netReceived,
      method: input.refundMethod,
      createdAt: DEMO_NOW_ISO,
      kind: 'REFUND',
      actorId: actor.id,
    };
  }

  for (const order of linked) {
    const applied = applyWorkOrderBranch(order, input.inProgressDecision);
    if (!applied.ok) {
      return applied;
    }
  }

  const woByPiece = new Map(linked.map((order) => [order.pieceId, order]));
  restoreInventoryForInvoice(state, invoice, woByPiece);

  if (refund) {
    invoice.payments.push(refund);
  }

  invoice.status = 'CANCELLED';
  invoice.cancelledAt = DEMO_NOW_ISO;
  invoice.cancelReason = reason;
  invoice.paymentState = derivePaymentState(invoice);

  const number = invoice.number ?? invoice.id;
  appendEvent(state, 'INVOICE_CANCELLED', `Factura ${number} cancelada`, actor, {
    invoiceId: invoice.id,
    reason,
    refundAmount: refund?.amount ?? 0,
    workOrderIds: linked.map((order) => order.id),
    inProgressDecision: input.inProgressDecision,
  });

  return ok(invoice);
}

export function correctCurrency(
  state: AppState,
  actor: User,
  input: CorrectCurrencyInput,
): Result<Invoice> {
  const found = findInvoice(state, input.invoiceId);
  if (!found.ok) {
    return found;
  }

  const invoice = found.value;
  const reason = input.reason.trim();

  if (invoice.status !== 'COMPLETED') {
    return err({
      code: 'VALIDATION',
      message: 'Solo se puede corregir la moneda de una factura completada',
    });
  }

  if (hasRecordedReceipts(invoice) || invoice.payments.length > 0) {
    return err({
      code: 'VALIDATION',
      message: 'No se puede corregir la moneda cuando ya existen pagos',
    });
  }

  if (!reason) {
    return err({ code: 'VALIDATION', message: 'La corrección de moneda requiere un motivo' });
  }

  if (input.currency === invoice.currency) {
    return err({ code: 'VALIDATION', message: 'Seleccione una moneda distinta a la actual' });
  }

  const previous = invoice.currency;
  const manualGrossProfitDopBefore = invoice.manualGrossProfitDop ?? null;
  invoice.currency = input.currency;
  delete invoice.manualGrossProfitDop;
  delete invoice.manualGrossProfitAt;

  // Amounts are not converted (INV-006). Profitability is re-derived under the corrected currency.
  if (input.currency === 'USD') {
    applyUsdProfitability(state, invoice);
  } else {
    invoice.profitabilityPendingFx = false;
    invoice.profitabilityUsd = null;
    delete invoice.fxRateDopPerUsd;
    delete invoice.fxSource;
    delete invoice.fxRateAt;
    delete invoice.fxCalculatedAt;
  }

  const number = invoice.number ?? invoice.id;
  appendEvent(
    state,
    'INVOICE_CURRENCY_CORRECTED',
    `Moneda de ${number} corregida de ${previous} a ${input.currency}`,
    actor,
    {
      invoiceId: invoice.id,
      reason,
      currencyBefore: previous,
      currencyAfter: input.currency,
      manualGrossProfitDopBefore,
      manualGrossProfitInvalidated: manualGrossProfitDopBefore != null,
    },
  );

  return ok(invoice);
}

/** POS draft mutations — kept beside post-sale commands so features import one sales-commands surface. */
export {
  addDraftLine,
  confirmInvoice,
  createDraft,
  discardDraft,
  removeDraftLine,
  setDraftLinePrice,
  setDraftLineQuantity,
  setDraftMeta,
} from './sales-pos-commands';
