import type { LineType } from '../../api/contracts/entities';
import type { PosLineView } from '../../api/contracts/sales';
import type { AppError } from '../../shared/auth/types';
import type { AppCapabilities } from '../../shared/config/capabilities';

export const POS_VIEW_REQUIREMENTS_LABEL = 'Ver requisitos';
export const POS_LINE_REMOVED_TOAST = 'Producto eliminado.';
export const POS_REMOVE_LINE_TITLE = 'Quitar línea';
export const POS_REMOVE_LINE_CONFIRM = 'Quitar';
export const POS_DRAFT_DISCARDED_TOAST = 'Borrador descartado.';
export const POS_DISCARD_DRAFT_TITLE = 'Descartar borrador';
export const POS_DISCARD_DRAFT_CONFIRM = 'Sí, descartar';
export const POS_DISCARD_DRAFT_CANCEL = 'Seguir editando';
export const POS_UNDO_LABEL = 'Deshacer';

export const POS_FIELD_IDS = {
  customer: 'pos-customer',
  currency: 'pos-currency',
  fiscal: 'pos-fiscal',
  lines: 'pos-lines',
  blockers: 'pos-blockers',
} as const;

export function posLinePriceFieldId(lineId: string): string {
  return `pos-line-price-${lineId}`;
}

export function posLineSku(line: Pick<PosLineView, 'itemId' | 'qtyProductId' | 'serviceId'>): string | undefined {
  return line.itemId ?? line.qtyProductId ?? line.serviceId;
}

/**
 * Short reason next to Confirmar venta. Full blocker list stays in Totals.
 */
export function posBlockedConfirmSummary(blockers: string[]): string | null {
  if (blockers.length === 0) {
    return null;
  }
  if (blockers.length === 1) {
    return blockers[0] ?? null;
  }
  return `Faltan ${blockers.length} requisitos`;
}

function normalizeBlockerText(blocker: string): string {
  return blocker
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function blockerMentions(blocker: string, ...needles: string[]): boolean {
  const normalized = normalizeBlockerText(blocker);
  return needles.some((needle) => normalized.includes(needle));
}

/**
 * First incomplete field for "Ver requisitos", in the plan order:
 * customer → pending price → currency → fiscal → other.
 */
export function firstPosProblemElementId(draft: {
  blockers: string[];
  lines: Array<{ id: string; pricePending: boolean }>;
}): string | null {
  if (draft.blockers.length === 0) {
    return null;
  }

  if (draft.blockers.some((blocker) => blockerMentions(blocker, 'cliente'))) {
    return POS_FIELD_IDS.customer;
  }

  const pendingPriceLine = draft.lines.find((line) => line.pricePending);
  if (pendingPriceLine) {
    return posLinePriceFieldId(pendingPriceLine.id);
  }

  if (draft.blockers.some((blocker) => blockerMentions(blocker, 'moneda'))) {
    return POS_FIELD_IDS.currency;
  }

  if (draft.blockers.some((blocker) => blockerMentions(blocker, 'fiscal', 'rnc', 'cedula', 'comprobante'))) {
    return POS_FIELD_IDS.fiscal;
  }

  if (draft.blockers.some((blocker) => blockerMentions(blocker, 'linea'))) {
    return POS_FIELD_IDS.lines;
  }

  return POS_FIELD_IDS.blockers;
}

const FOCUSABLE_CONTROL = 'input, select, textarea, button, [tabindex]';

/** Focus and scroll the control whose id was resolved from blockers. */
export function focusPosElement(elementId: string): void {
  const element = document.getElementById(elementId);
  if (!(element instanceof HTMLElement)) {
    return;
  }

  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const focusable = element.matches(FOCUSABLE_CONTROL)
    ? element
    : element.querySelector<HTMLElement>(FOCUSABLE_CONTROL);
  focusable?.focus();
}

/**
 * POS copy follows the active capabilities so Release 2 billing never
 * implies inventory reservation (Development Plan: no stock sync until Release 5).
 */
export function posDraftDescription(capabilities: AppCapabilities): string {
  if (capabilities.inventorySales || capabilities.quantitySales) {
    return 'Edite el borrador: las piezas de inventario quedan reservadas hasta confirmar o descartar.';
  }

  return 'Edite el borrador, asigne precios y confirme la factura.';
}

export function posEmptyLinesMessage(capabilities: AppCapabilities): string {
  if (capabilities.inventorySales || capabilities.quantitySales) {
    return 'No hay líneas. Agregue inventario o una línea libre.';
  }

  return 'No hay líneas. Agregue mercancía, un servicio o una entrega.';
}

export function posAddLineReservationHint(type: LineType): string | null {
  if (type === 'ITEM') {
    return 'Al agregar, esta pieza queda reservada para este borrador hasta confirmar o descartar.';
  }

  if (type === 'QTY') {
    return 'Al agregar, esas unidades quedan reservadas para este borrador hasta confirmar o descartar.';
  }

  return null;
}

const SOLD_ITEM = /^(\S+) ya está vendido$/i;
const UNRESERVED_ITEM = /^(\S+) no está reservado por este borrador$/i;
const QTY_STOCK = /^Stock insuficiente para (\S+)$/i;
const HTTP_STATUS = /^HTTP\s+(\d+)/i;

/**
 * Maps repository/HTTP failures to what the seller should do next.
 * Does not change domain rules; only presentation.
 */
export function toPosUserMessage(error: AppError): string {
  const raw = error.message.trim();
  const http = HTTP_STATUS.exec(raw);

  if (http && (http[1] === '409' || error.code === 'CONFLICT')) {
    return 'La pieza ya no está disponible. Elimínala del borrador o selecciona otra.';
  }

  if (http) {
    return 'No se pudo completar la operación. Revisa las líneas e inténtalo de nuevo.';
  }

  const sold = SOLD_ITEM.exec(raw);
  if (sold) {
    return `La pieza ${sold[1]} ya no está disponible. Elimínala del borrador o selecciona otra.`;
  }

  const unreserved = UNRESERVED_ITEM.exec(raw);
  if (unreserved) {
    return `La pieza ${unreserved[1]} ya no está disponible. Elimínala del borrador o selecciona otra.`;
  }

  const qty = QTY_STOCK.exec(raw);
  if (qty) {
    return `Esa cantidad de ${qty[1]} ya no está disponible. Ajusta la línea o elige otro producto.`;
  }

  return raw;
}
