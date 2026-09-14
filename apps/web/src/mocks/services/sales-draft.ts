import type { AppState, Invoice, InvoiceLine, Item } from '../../api/contracts/entities';
import type { PosDraftView, PosLineView } from '../../api/contracts/sales';
import { buildItemDetail } from './inventory-catalog';
import {
  availableToReserve,
  isAssemblyItem,
  itemById,
  protectedAncestor,
} from './inventory-helpers';
import { activeWorkAffectingAssembly, customerQualifiesForFiscal } from './sales-helpers';
import {
  invoiceItbis,
  invoiceTaxableBase,
  invoiceTotal,
  lineBase,
  lineGross,
  lineItbis,
} from './invoice-money';

function toLineView(state: AppState, invoice: Invoice, line: InvoiceLine): PosLineView {
  const item = line.itemId ? itemById(state.items, line.itemId) : undefined;
  const detail = line.itemId ? buildItemDetail(state, line.itemId) : undefined;
  const isAssembly = item ? isAssemblyItem(item, state.categories) : false;
  const blocking = item && isAssembly ? activeWorkAffectingAssembly(state, item.id) : undefined;

  return {
    id: line.id,
    type: line.type,
    description: line.description,
    notes: line.notes,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxable: line.taxable,
    pricePending: Boolean(line.pricePending),
    gross: lineGross(line),
    itbis: lineItbis(line, invoice.fiscal),
    base: lineBase(line, invoice.fiscal),
    itemId: line.itemId,
    qtyProductId: line.qtyProductId,
    serviceId: line.serviceId,
    acquisitionCostDop: line.acquisitionCostDop,
    costProvenance: line.costProvenance ?? (line.acquisitionCostDop == null ? 'UNKNOWN' : 'ACTUAL'),
    installed: item?.physicalRelationship === 'INSTALLED',
    parentName: item?.parentId ? itemById(state.items, item.parentId)?.name : undefined,
    isAssembly,
    tree: detail?.kind === 'ITEM' ? detail.tree : undefined,
    activeWorkMessage: blocking
      ? `Trabajo físico activo (${blocking.id}) bloquea confirmar este ensamblaje`
      : undefined,
  };
}

function sellableItems(state: AppState, draft: Invoice): PosDraftView['items'] {
  return state.items
    .filter((item: Item) => {
      if (item.commercialState === 'SOLD') {
        return false;
      }
      if (draft.lines.some((line) => line.itemId === item.id)) {
        return false;
      }
      const restriction = protectedAncestor(state.items, item);
      if (restriction && restriction.id !== item.id) {
        return false;
      }
      if (item.reservedByDraftId && item.reservedByDraftId !== draft.id) {
        return false;
      }
      return true;
    })
    .map((item) => ({
      id: item.id,
      name: item.name,
      reservedByDraftId: item.reservedByDraftId,
    }));
}

function blockersFor(state: AppState, invoice: Invoice, lines: PosLineView[]): string[] {
  if (invoice.status !== 'DRAFT') {
    return [];
  }

  const blockers: string[] = [];
  if (invoice.lines.length === 0) {
    blockers.push('Agregue al menos una línea');
  }
  if (lines.some((line) => line.pricePending)) {
    blockers.push('Hay precios pendientes');
  }

  const customer = state.customers.find((entry) => entry.id === invoice.customerId);
  if (invoice.fiscal && !customerQualifiesForFiscal(customer)) {
    blockers.push('La factura fiscal requiere un cliente con RNC o cédula');
  }

  for (const line of lines) {
    if (line.activeWorkMessage) {
      blockers.push(line.activeWorkMessage);
    }
  }

  return blockers;
}

export function buildPosDraftView(state: AppState, invoice: Invoice): PosDraftView {
  const customer = state.customers.find((entry) => entry.id === invoice.customerId);
  const lines = invoice.lines.map((line) => toLineView(state, invoice, line));

  return {
    id: invoice.id,
    status: invoice.status,
    number: invoice.number,
    customerId: invoice.customerId,
    customerName: invoice.customerSnapshot?.name ?? customer?.name ?? invoice.customerId,
    customerRnc: invoice.customerSnapshot?.rnc ?? customer?.rnc,
    customerIsDefault: Boolean(customer?.isDefault),
    currency: invoice.currency,
    fiscal: invoice.fiscal,
    lines,
    totals: {
      lineCount: invoice.lines.length,
      gross: invoiceTotal(invoice),
      itbis: invoiceItbis(invoice),
      taxableBase: invoiceTaxableBase(invoice),
    },
    customers: state.customers.map((entry) => ({
      id: entry.id,
      name: entry.name,
      rnc: entry.rnc,
      isDefault: entry.isDefault,
    })),
    services: state.services
      .filter((service) => service.active)
      .map((service) => ({ id: service.id, name: service.name })),
    qtyProducts: state.qtyProducts.map((product) => ({
      id: product.id,
      name: product.name,
      available: availableToReserve(product.onHand, product.reserved),
    })),
    items: sellableItems(state, invoice),
    blockers: blockersFor(state, invoice, lines),
    createdWorkOrderIds: state.workOrders
      .filter(
        (order) =>
          order.invoiceId === invoice.id || Boolean(order.linkedInvoiceIds?.includes(invoice.id)),
      )
      .map((order) => order.id),
  };
}
