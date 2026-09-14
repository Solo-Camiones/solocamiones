import type {
  AddDraftLineInput,
  ConfirmInvoicePayment,
  CreateDraftResult,
  RemoveDraftLineInput,
  SetDraftLinePriceInput,
  SetDraftLineQuantityInput,
  SetDraftMetaInput,
} from '../../api/contracts/sales';
import type {
  AppEvent,
  AppState,
  DeliveredAssembly,
  Invoice,
  InvoiceLine,
  Item,
  LineType,
  Payment,
  PaymentMethod,
  User,
  WorkOrder,
} from '../../api/contracts/entities';
import { err, ok, type Result } from '../../shared/auth/types';
import { currentDemoTimeIso, DEMO_NOW_ISO } from '../data/demo-clock';
import {
  availableToReserve,
  collectSubtree,
  isAssemblyItem,
  itemById,
  overlappingReservation,
  protectedAncestor,
} from './inventory-helpers';
import { derivePaymentState, invoiceTotal, roundMoney } from './invoice-money';
import {
  activeWorkAffectingAssembly,
  CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE,
  CASH_CUSTOMER_ID,
  customerQualifiesForFiscal,
  isCashCustomer,
} from './sales-helpers';
import { applyUsdProfitability } from './usd-profitability';

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

function requireDraft(invoice: Invoice): Result<Invoice> {
  if (invoice.status !== 'DRAFT') {
    return err({ code: 'VALIDATION', message: 'Solo se puede editar un borrador' });
  }
  return ok(invoice);
}

function nextLineId(draft: Invoice): string {
  return nextNumericId(
    draft.lines.map((line) => line.id),
    'L-D',
    1,
  );
}

function isTaxableLineType(type: LineType): boolean {
  return type !== 'SERVICE' && type !== 'DELIVERY';
}

function optionalLineNotes(notes?: string | null): string | undefined {
  const trimmed = notes?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
}

function parseNonNegativeMoney(value: number | undefined): Result<number> {
  if (value == null || !Number.isFinite(value)) {
    return err({ code: 'VALIDATION', message: 'El precio debe ser un número válido' });
  }
  const rounded = roundMoney(value);
  if (rounded < 0) {
    return err({ code: 'VALIDATION', message: 'El precio no puede ser negativo' });
  }
  return ok(rounded);
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

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'CHECK'];

function allPaymentIds(state: AppState): string[] {
  return state.invoices.flatMap((invoice) => invoice.payments.map((payment) => payment.id));
}

function parsePositiveInteger(value: number | undefined, fallback = 1): Result<number> {
  const quantity = value ?? fallback;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return err({ code: 'VALIDATION', message: 'La cantidad debe ser un entero mayor que cero' });
  }
  return ok(quantity);
}

function releaseLineReservation(state: AppState, line: InvoiceLine): void {
  if (line.itemId) {
    const item = itemById(state.items, line.itemId);
    if (item?.reservedByDraftId) {
      delete item.reservedByDraftId;
    }
  }

  if (line.qtyProductId) {
    const product = state.qtyProducts.find((entry) => entry.id === line.qtyProductId);
    if (product) {
      product.reserved = Math.max(0, product.reserved - line.quantity);
    }
  }
}

function reserveItemOnDraft(
  state: AppState,
  actor: User,
  draft: Invoice,
  item: Item,
): Result<void> {
  if (item.commercialState === 'SOLD') {
    return err({ code: 'VALIDATION', message: 'Este ítem ya está vendido' });
  }

  const restriction = protectedAncestor(state.items, item);
  if (restriction && restriction.id !== item.id) {
    return err({
      code: 'VALIDATION',
      message: `No se puede vender por separado: No desarmar en ${restriction.id}`,
      details: { protectedRootId: restriction.id },
    });
  }

  if (item.reservedByDraftId && item.reservedByDraftId !== draft.id) {
    return err({
      code: 'CONFLICT',
      message: `Reservado en el borrador ${item.reservedByDraftId}`,
    });
  }

  const overlap = overlappingReservation(state.items, item, draft.id);
  if (overlap) {
    return err({
      code: 'CONFLICT',
      message: `Hay una reserva solapada en ${overlap.id}`,
    });
  }

  item.reservedByDraftId = draft.id;
  appendEvent(state, 'ITEM_RESERVED', `${item.id} reservado en borrador ${draft.id}`, actor, {
    itemId: item.id,
    draftId: draft.id,
  });
  return ok(undefined);
}

/**
 * Opens a new draft even when another DRAFT already exists.
 * Inventory addToDraft still reuses the first open draft (WM5); POS needs distinct
 * drafts so "reservado por otro borrador" can be demonstrated.
 */
export function createDraft(state: AppState, actor: User): Result<CreateDraftResult> {
  const draft: Invoice = {
    id: nextNumericId(
      state.invoices.map((invoice) => invoice.id),
      'INV-DRAFT-',
      2,
    ),
    status: 'DRAFT',
    customerId: CASH_CUSTOMER_ID,
    currency: 'DOP',
    fiscal: false,
    lines: [],
    payments: [],
    paymentState: 'UNPAID',
    createdAt: currentDemoTimeIso(),
  };
  state.invoices.push(draft);
  appendEvent(state, 'DRAFT_CREATED', `Borrador ${draft.id} creado`, actor, { draftId: draft.id });
  return ok({ draftId: draft.id });
}

export function addDraftLine(
  state: AppState,
  actor: User,
  input: AddDraftLineInput,
): Result<Invoice> {
  const found = findInvoice(state, input.draftId);
  if (!found.ok) {
    return found;
  }
  const draftResult = requireDraft(found.value);
  if (!draftResult.ok) {
    return draftResult;
  }
  const draft = draftResult.value;

  if (input.type === 'ITEM') {
    if (!input.itemId) {
      return err({ code: 'VALIDATION', message: 'Seleccione un ítem de inventario' });
    }
    const item = itemById(state.items, input.itemId);
    if (!item) {
      return err({ code: 'NOT_FOUND', message: 'Pieza no encontrada' });
    }
    if (draft.lines.some((line) => line.itemId === item.id)) {
      return ok(draft);
    }
    const reserved = reserveItemOnDraft(state, actor, draft, item);
    if (!reserved.ok) {
      return reserved;
    }
    draft.lines.push({
      id: nextLineId(draft),
      type: 'ITEM',
      description: item.name,
      notes: optionalLineNotes(input.notes),
      itemId: item.id,
      quantity: 1,
      unitPrice: 0,
      taxable: true,
      pricePending: true,
      acquisitionCostDop: item.acquisitionCostDop,
    });
    return ok(draft);
  }

  if (input.type === 'QTY') {
    if (!input.qtyProductId) {
      return err({ code: 'VALIDATION', message: 'Seleccione un producto por cantidad' });
    }
    const product = state.qtyProducts.find((entry) => entry.id === input.qtyProductId);
    if (!product) {
      return err({ code: 'NOT_FOUND', message: 'Producto no encontrado' });
    }
    const quantity = parsePositiveInteger(input.quantity);
    if (!quantity.ok) {
      return quantity;
    }
    const available = availableToReserve(product.onHand, product.reserved);
    if (quantity.value > available) {
      return err({
        code: 'VALIDATION',
        message: `Solo hay ${available} unidad(es) disponible(s)`,
      });
    }
    const priced = input.unitPrice == null ? undefined : parseNonNegativeMoney(input.unitPrice);
    if (priced && !priced.ok) {
      return priced;
    }
    const unitPrice = priced?.ok ? priced.value : 0;
    const pricePending = priced == null;
    const existingLine = draft.lines.find((line) => line.qtyProductId === product.id);
    if (existingLine) {
      existingLine.quantity += quantity.value;
      if (!pricePending) {
        existingLine.unitPrice = unitPrice;
        existingLine.pricePending = false;
      }
      // Keep the first unit-cost snapshot; do not blend a later QTY average into this line.
    } else {
      draft.lines.push({
        id: nextLineId(draft),
        type: 'QTY',
        description: product.name,
        notes: optionalLineNotes(input.notes),
        qtyProductId: product.id,
        quantity: quantity.value,
        unitPrice,
        taxable: true,
        pricePending,
        acquisitionCostDop: product.unitCostDop,
      });
    }
    product.reserved += quantity.value;
    appendEvent(
      state,
      'QTY_RESERVED',
      `${quantity.value} × ${product.id} reservado en borrador ${draft.id}`,
      actor,
      { qtyProductId: product.id, draftId: draft.id, quantity: quantity.value },
    );
    return ok(draft);
  }

  if (input.type === 'SERVICE') {
    if (!input.serviceId) {
      return err({ code: 'VALIDATION', message: 'Seleccione un servicio' });
    }
    const service = state.services.find((entry) => entry.id === input.serviceId);
    if (!service) {
      return err({ code: 'NOT_FOUND', message: 'Servicio no encontrado' });
    }
    if (!service.active) {
      return err({ code: 'VALIDATION', message: 'Ese servicio no está activo' });
    }
    const unitPrice = parseNonNegativeMoney(input.unitPrice ?? 0);
    if (!unitPrice.ok) {
      return unitPrice;
    }
    draft.lines.push({
      id: nextLineId(draft),
      type: 'SERVICE',
      description: service.name,
      notes: optionalLineNotes(input.notes),
      serviceId: service.id,
      quantity: 1,
      unitPrice: unitPrice.value,
      taxable: false,
      pricePending: false,
    });
    return ok(draft);
  }

  const description = input.description?.trim() || (input.type === 'DELIVERY' ? 'Entrega' : '');
  if (!description) {
    return err({ code: 'VALIDATION', message: 'La descripción es obligatoria' });
  }
  const quantity = parsePositiveInteger(input.type === 'DELIVERY' ? 1 : input.quantity);
  if (!quantity.ok) {
    return quantity;
  }
  const unitPrice = parseNonNegativeMoney(input.unitPrice ?? 0);
  if (!unitPrice.ok) {
    return unitPrice;
  }
  if (
    input.acquisitionCostDop != null &&
    (!Number.isFinite(input.acquisitionCostDop) || input.acquisitionCostDop < 0)
  ) {
    return err({
      code: 'VALIDATION',
      message: 'El costo de adquisición debe ser un número válido',
    });
  }

  draft.lines.push({
    id: nextLineId(draft),
    type: input.type,
    description,
    notes: optionalLineNotes(input.notes),
    quantity: quantity.value,
    unitPrice: unitPrice.value,
    taxable: isTaxableLineType(input.type),
    pricePending: false,
    acquisitionCostDop:
      input.type === 'GENERIC' || input.type === 'EXTERNAL' ? input.acquisitionCostDop : undefined,
    costProvenance:
      input.type === 'GENERIC' || input.type === 'EXTERNAL'
        ? input.acquisitionCostDop == null
          ? 'UNKNOWN'
          : (input.costProvenance ?? 'ACTUAL')
        : undefined,
  });
  return ok(draft);
}

export function removeDraftLine(
  state: AppState,
  _actor: User,
  input: RemoveDraftLineInput,
): Result<Invoice> {
  const found = findInvoice(state, input.draftId);
  if (!found.ok) {
    return found;
  }
  const draftResult = requireDraft(found.value);
  if (!draftResult.ok) {
    return draftResult;
  }
  const draft = draftResult.value;
  const index = draft.lines.findIndex((line) => line.id === input.lineId);
  if (index < 0) {
    return err({ code: 'NOT_FOUND', message: 'Línea no encontrada' });
  }

  const [removed] = draft.lines.splice(index, 1);
  if (removed) {
    releaseLineReservation(state, removed);
  }
  return ok(draft);
}

export function setDraftLinePrice(
  state: AppState,
  _actor: User,
  input: SetDraftLinePriceInput,
): Result<Invoice> {
  const found = findInvoice(state, input.draftId);
  if (!found.ok) {
    return found;
  }
  const draftResult = requireDraft(found.value);
  if (!draftResult.ok) {
    return draftResult;
  }
  const line = draftResult.value.lines.find((entry) => entry.id === input.lineId);
  if (!line) {
    return err({ code: 'NOT_FOUND', message: 'Línea no encontrada' });
  }
  const unitPrice = parseNonNegativeMoney(input.unitPrice);
  if (!unitPrice.ok) {
    return unitPrice;
  }

  const descriptionEditable =
    line.type === 'GENERIC' || line.type === 'EXTERNAL' || line.type === 'DELIVERY';
  let description: string | undefined;
  if (input.description !== undefined && descriptionEditable) {
    description = input.description.trim() || (line.type === 'DELIVERY' ? 'Entrega' : '');
    if (!description) {
      return err({ code: 'VALIDATION', message: 'La descripción es obligatoria' });
    }
  }

  let acquisitionCostDop: number | null | undefined;
  if (
    input.acquisitionCostDop !== undefined &&
    (line.type === 'GENERIC' || line.type === 'EXTERNAL')
  ) {
    if (input.acquisitionCostDop == null) {
      acquisitionCostDop = null;
    } else {
      const cost = parseNonNegativeMoney(input.acquisitionCostDop);
      if (!cost.ok) {
        return cost;
      }
      acquisitionCostDop = cost.value;
    }
  }

  let quantity: number | undefined;
  if (input.quantity !== undefined) {
    if (!QUANTITY_EDITABLE_LINE_TYPES.has(line.type)) {
      return err({
        code: 'VALIDATION',
        message: 'Este tipo de línea no permite cambiar la cantidad',
      });
    }
    const parsedQuantity = parsePositiveInteger(input.quantity);
    if (!parsedQuantity.ok) {
      return parsedQuantity;
    }
    quantity = parsedQuantity.value;
    if (line.type === 'QTY' && quantity !== line.quantity) {
      const adjusted = adjustQtyReservation(state, _actor, draftResult.value.id, line, quantity);
      if (!adjusted.ok) {
        return adjusted;
      }
    }
  }

  line.unitPrice = unitPrice.value;
  line.pricePending = false;
  if (quantity !== undefined) line.quantity = quantity;
  if (description !== undefined) line.description = description;
  if (input.notes !== undefined) {
    const notes = optionalLineNotes(input.notes);
    if (notes) {
      line.notes = notes;
    } else {
      delete line.notes;
    }
  }
  if (acquisitionCostDop === null) {
    delete line.acquisitionCostDop;
    line.costProvenance = 'UNKNOWN';
  } else if (acquisitionCostDop !== undefined) {
    line.acquisitionCostDop = acquisitionCostDop;
    line.costProvenance = input.costProvenance ?? 'ACTUAL';
  } else if (input.costProvenance !== undefined) {
    line.costProvenance = input.costProvenance;
  }

  return ok(draftResult.value);
}

const QUANTITY_EDITABLE_LINE_TYPES: ReadonlySet<LineType> = new Set(['QTY', 'GENERIC', 'EXTERNAL']);

export function setDraftLineQuantity(
  state: AppState,
  actor: User,
  input: SetDraftLineQuantityInput,
): Result<Invoice> {
  const found = findInvoice(state, input.draftId);
  if (!found.ok) {
    return found;
  }
  const draftResult = requireDraft(found.value);
  if (!draftResult.ok) {
    return draftResult;
  }
  const line = draftResult.value.lines.find((entry) => entry.id === input.lineId);
  if (!line) {
    return err({ code: 'NOT_FOUND', message: 'Línea no encontrada' });
  }
  if (!QUANTITY_EDITABLE_LINE_TYPES.has(line.type)) {
    return err({
      code: 'VALIDATION',
      message: 'Este tipo de línea no permite cambiar la cantidad',
    });
  }

  const quantity = parsePositiveInteger(input.quantity);
  if (!quantity.ok) {
    return quantity;
  }
  if (quantity.value === line.quantity) {
    return ok(draftResult.value);
  }

  if (line.type === 'QTY') {
    const adjusted = adjustQtyReservation(state, actor, draftResult.value.id, line, quantity.value);
    if (!adjusted.ok) {
      return adjusted;
    }
  }

  line.quantity = quantity.value;
  return ok(draftResult.value);
}

function adjustQtyReservation(
  state: AppState,
  actor: User,
  draftId: string,
  line: InvoiceLine,
  nextQuantity: number,
): Result<void> {
  const product = state.qtyProducts.find((entry) => entry.id === line.qtyProductId);
  if (!product) {
    return err({ code: 'NOT_FOUND', message: 'Producto no encontrado' });
  }

  const delta = nextQuantity - line.quantity;
  if (delta > 0) {
    const available = availableToReserve(product.onHand, product.reserved);
    if (delta > available) {
      return err({
        code: 'VALIDATION',
        message: `Solo hay ${available} unidad(es) disponible(s)`,
      });
    }
    product.reserved += delta;
    appendEvent(
      state,
      'QTY_RESERVED',
      `${delta} × ${product.id} reservado en borrador ${draftId}`,
      actor,
      { qtyProductId: product.id, draftId, quantity: delta },
    );
    return ok(undefined);
  }

  product.reserved = Math.max(0, product.reserved + delta);
  return ok(undefined);
}

export function setDraftMeta(
  state: AppState,
  _actor: User,
  input: SetDraftMetaInput,
): Result<Invoice> {
  const found = findInvoice(state, input.draftId);
  if (!found.ok) {
    return found;
  }
  const draftResult = requireDraft(found.value);
  if (!draftResult.ok) {
    return draftResult;
  }
  const draft = draftResult.value;

  if (input.customerId) {
    const customer = state.customers.find((entry) => entry.id === input.customerId);
    if (!customer) {
      return err({ code: 'NOT_FOUND', message: 'Cliente no encontrado' });
    }
    const nextFiscal = input.fiscal ?? draft.fiscal;
    if (nextFiscal && !customerQualifiesForFiscal(customer)) {
      return err({
        code: 'VALIDATION',
        message: 'La factura fiscal requiere un cliente con RNC o cédula',
      });
    }
    draft.customerId = customer.id;
  }

  if (input.currency) {
    draft.currency = input.currency;
  }

  if (input.fiscal != null) {
    const customer = state.customers.find((entry) => entry.id === draft.customerId);
    if (input.fiscal && !customerQualifiesForFiscal(customer)) {
      return err({
        code: 'VALIDATION',
        message: 'La factura fiscal requiere un cliente con RNC o cédula',
      });
    }
    draft.fiscal = input.fiscal;
  }

  return ok(draft);
}

export function discardDraft(state: AppState, actor: User, draftId: string): Result<void> {
  const found = findInvoice(state, draftId);
  if (!found.ok) {
    return found;
  }
  const draftResult = requireDraft(found.value);
  if (!draftResult.ok) {
    return draftResult;
  }
  const draft = draftResult.value;

  for (const line of draft.lines) {
    releaseLineReservation(state, line);
  }

  state.invoices = state.invoices.filter((invoice) => invoice.id !== draft.id);
  appendEvent(state, 'DRAFT_DISCARDED', `Borrador ${draft.id} descartado`, actor, {
    draftId: draft.id,
  });
  return ok(undefined);
}

function markItemSold(item: Item): void {
  item.commercialState = 'SOLD';
  delete item.reservedByDraftId;
}

/**
 * COST-003: copy live inventory cost onto the line only when the line has none.
 * A value already stored (POS add, inventory addItemLine, EXTERNAL input) is the sale snapshot.
 */
function freezeLineAcquisitionCost(state: AppState, line: InvoiceLine): void {
  if (line.acquisitionCostDop != null) {
    return;
  }

  if (line.type === 'ITEM' && line.itemId) {
    const item = itemById(state.items, line.itemId);
    if (item?.acquisitionCostDop != null) {
      line.acquisitionCostDop = item.acquisitionCostDop;
    }
    return;
  }

  if (line.type === 'QTY' && line.qtyProductId) {
    const product = state.qtyProducts.find((entry) => entry.id === line.qtyProductId);
    if (product) {
      line.acquisitionCostDop = product.unitCostDop;
    }
  }
}

function snapshotDeliveredAssembly(items: Item[], root: Item): DeliveredAssembly {
  return {
    rootItemId: root.id,
    nodes: [root, ...collectSubtree(items, root.id)].map((node) => ({
      itemId: node.id,
      parentId: node.parentId,
      name: node.name,
    })),
  };
}

function uniqueAppendInvoiceIds(
  existing: string[] | undefined,
  ...invoiceIds: Array<string | undefined>
): string[] {
  const result = existing ? [...existing] : [];
  for (const invoiceId of invoiceIds) {
    if (invoiceId && !result.includes(invoiceId)) {
      result.push(invoiceId);
    }
  }
  return result;
}

function ensureDismantlingOrder(
  state: AppState,
  actor: User,
  invoice: Invoice,
  item: Item,
): WorkOrder {
  const existing = state.workOrders.find(
    (order) =>
      order.pieceId === item.id &&
      order.type === 'DISMANTLING' &&
      (order.status === 'PENDING' || order.status === 'IN_PROGRESS'),
  );
  if (existing) {
    // CANCEL-005 / HIST-002: keep prior commercial invoices when the active WO is reused.
    existing.linkedInvoiceIds = uniqueAppendInvoiceIds(
      existing.linkedInvoiceIds,
      existing.invoiceId,
      invoice.id,
    );
    existing.invoiceId = invoice.id;
    return existing;
  }

  const order: WorkOrder = {
    id: nextNumericId(
      state.workOrders.map((entry) => entry.id),
      'OD-DEMO-',
      3,
    ),
    type: 'DISMANTLING',
    status: 'PENDING',
    pieceId: item.id,
    sourceParentId: item.parentId,
    invoiceId: invoice.id,
    linkedInvoiceIds: [invoice.id],
    notes: 'Desarme por venta de pieza instalada',
    beforePhotos: [],
    afterPhotos: [],
    createdAt: DEMO_NOW_ISO,
  };
  state.workOrders.push(order);
  appendEvent(
    state,
    'WORK_ORDER_CREATED',
    `Orden de trabajo ${order.id} (desarme) creada para ${item.id}`,
    actor,
    { itemId: item.id, workOrderId: order.id, invoiceId: invoice.id },
  );
  return order;
}

/**
 * SALE-002: validate the whole draft first, then mutate.
 * A mid-loop failure must not leave inventory sold or a FAC- number consumed.
 * A second call on an already completed invoice is idempotent (no new FAC-).
 * PAY-001 / SALE-005: optional initial payment is validated here so a bad amount
 * cannot complete the sale unpaid, then appended after COMPLETED (same ledger rules as addPayment).
 */
export function confirmInvoice(
  state: AppState,
  actor: User,
  draftId: string,
  payment?: ConfirmInvoicePayment,
): Result<Invoice> {
  const found = findInvoice(state, draftId);
  if (!found.ok) {
    return found;
  }
  const invoice = found.value;

  if (invoice.status === 'COMPLETED') {
    return ok(invoice);
  }
  if (invoice.status !== 'DRAFT') {
    return err({ code: 'VALIDATION', message: 'Solo se puede confirmar un borrador' });
  }
  if (invoice.lines.length === 0) {
    return err({ code: 'VALIDATION', message: 'Agregue al menos una línea' });
  }
  if (invoice.lines.some((line) => line.pricePending)) {
    return err({ code: 'VALIDATION', message: 'Hay precios pendientes' });
  }

  const customer = state.customers.find((entry) => entry.id === invoice.customerId);
  if (!customer) {
    return err({ code: 'NOT_FOUND', message: 'Cliente no encontrado' });
  }
  if (invoice.fiscal && !customerQualifiesForFiscal(customer)) {
    return err({
      code: 'VALIDATION',
      message: 'La factura fiscal requiere un cliente con RNC o cédula',
    });
  }

  for (const line of invoice.lines) {
    if (line.itemId) {
      const item = itemById(state.items, line.itemId);
      if (!item) {
        return err({ code: 'NOT_FOUND', message: `Pieza ${line.itemId} no encontrada` });
      }
      if (item.commercialState === 'SOLD') {
        return err({ code: 'CONFLICT', message: `${item.id} ya está vendido` });
      }
      if (item.reservedByDraftId !== invoice.id) {
        return err({
          code: 'CONFLICT',
          message: `${item.id} no está reservado por este borrador`,
        });
      }
      const restriction = protectedAncestor(state.items, item);
      if (restriction && restriction.id !== item.id) {
        return err({
          code: 'VALIDATION',
          message: `No se puede vender por separado: No desarmar en ${restriction.id}`,
        });
      }
      if (isAssemblyItem(item, state.categories)) {
        const blocking = activeWorkAffectingAssembly(state, item.id);
        if (blocking) {
          return err({
            code: 'CONFLICT',
            message: `No se puede confirmar este ensamblaje mientras hay trabajo físico activo (${blocking.id})`,
          });
        }
        const descendants = collectSubtree(state.items, item.id);
        const soldDescendant = descendants.find((node) => node.commercialState === 'SOLD');
        if (soldDescendant) {
          return err({
            code: 'CONFLICT',
            message: `No se puede confirmar el ensamblaje mientras el descendiente ${soldDescendant.id} ya está vendido`,
          });
        }
        const subtreeIds = new Set(descendants.map((node) => node.id));
        const conflictingLine = invoice.lines.find(
          (other) => other.itemId && other.id !== line.id && subtreeIds.has(other.itemId),
        );
        if (conflictingLine) {
          return err({
            code: 'CONFLICT',
            message: 'Un descendiente no puede ir como línea aparte del ensamblaje',
          });
        }
      }
    }

    if (line.qtyProductId) {
      const product = state.qtyProducts.find((entry) => entry.id === line.qtyProductId);
      if (!product) {
        return err({ code: 'NOT_FOUND', message: 'Producto no encontrado' });
      }
      if (product.reserved < line.quantity || product.onHand < line.quantity) {
        return err({
          code: 'CONFLICT',
          message: `Stock insuficiente para ${product.id}`,
        });
      }
    }
  }

  const invoiceGross = invoiceTotal(invoice);
  let initialPaymentAmount: number | undefined;
  if (payment) {
    if (!PAYMENT_METHODS.includes(payment.method)) {
      return err({ code: 'VALIDATION', message: 'El pago requiere un método' });
    }
    const amount = parsePositiveMoney(payment.amount);
    if (!amount.ok) {
      return amount;
    }
    if (amount.value > invoiceGross) {
      return err({
        code: 'VALIDATION',
        message: 'El pago no puede superar el saldo pendiente',
      });
    }
    initialPaymentAmount = amount.value;
  }
  if (
    isCashCustomer(customer) &&
    invoiceGross > 0 &&
    (initialPaymentAmount == null || initialPaymentAmount !== invoiceGross)
  ) {
    return err({
      code: 'CONFLICT',
      message: CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE,
    });
  }

  for (const line of invoice.lines) {
    freezeLineAcquisitionCost(state, line);
  }

  const number = `FAC-${String(state.facSeq).padStart(6, '0')}`;
  state.facSeq += 1;
  invoice.number = number;
  invoice.status = 'COMPLETED';
  invoice.confirmedAt = DEMO_NOW_ISO;
  invoice.paymentState = 'UNPAID';
  invoice.customerSnapshot = { name: customer.name, rnc: customer.rnc };
  if (invoice.currency === 'USD') {
    applyUsdProfitability(state, invoice);
  }

  for (const line of invoice.lines) {
    if (line.itemId) {
      const item = itemById(state.items, line.itemId)!;
      if (isAssemblyItem(item, state.categories)) {
        markItemSold(item);
        for (const descendant of collectSubtree(state.items, item.id)) {
          markItemSold(descendant);
        }
        // SALE-008: freeze the current tree as a value copy; later inventory edits
        // and cancellation must not rewrite this snapshot.
        invoice.deliveredAssemblies = [
          ...(invoice.deliveredAssemblies ?? []),
          snapshotDeliveredAssembly(state.items, item),
        ];
        // SALE-006: confirming an installed piece still needs a dismantling WO,
        // even when that piece is an assembly (SALE-008 only skips WO for independent ones).
        if (item.physicalRelationship === 'INSTALLED') {
          ensureDismantlingOrder(state, actor, invoice, item);
        }
        continue;
      }
      markItemSold(item);
      if (item.physicalRelationship === 'INSTALLED') {
        ensureDismantlingOrder(state, actor, invoice, item);
      }
      continue;
    }

    if (line.qtyProductId) {
      const product = state.qtyProducts.find((entry) => entry.id === line.qtyProductId)!;
      product.onHand -= line.quantity;
      product.reserved -= line.quantity;
    }
  }

  appendEvent(state, 'INVOICE_CONFIRMED', `Factura ${number} confirmada`, actor, {
    invoiceId: invoice.id,
    number,
  });

  if (payment && initialPaymentAmount != null) {
    if (payment.idempotencyKey) {
      const existing = invoice.payments.find(
        (entry) => entry.idempotencyKey === payment.idempotencyKey,
      );
      if (existing) {
        return ok(invoice);
      }
    }

    const receipt: Payment = {
      id: nextNumericId(allPaymentIds(state), 'PAY-', 3),
      invoiceId: invoice.id,
      amount: initialPaymentAmount,
      method: payment.method,
      createdAt: DEMO_NOW_ISO,
      kind: 'PAYMENT',
      actorId: actor.id,
      reference: payment.reference?.trim() || undefined,
      idempotencyKey: payment.idempotencyKey,
    };

    invoice.payments.push(receipt);
    invoice.paymentState = derivePaymentState(invoice);

    appendEvent(state, 'PAYMENT_RECORDED', `Pago registrado en ${number}`, actor, {
      invoiceId: invoice.id,
      paymentId: receipt.id,
      amount: receipt.amount,
      method: receipt.method,
    });
  }

  return ok(invoice);
}
