import type { MechanicWorkOrderView, WorkOrderType } from '../../api/contracts/entities';
import type { AppError } from '../../shared/auth/types';
import { UX_TERMS } from '../../shared/copy/glossary';

const HTTP_STATUS = /^HTTP\s+(\d+)/i;
const NETWORK_HINT = /failed to fetch|network|timeout|ECONNRESET|ERR_NETWORK/i;

/**
 * Maps repository/HTTP failures to a next action the mechanic can take.
 * Does not change assignment, evidence, or completion rules.
 */
export function toMechanicUserMessage(error: AppError): string {
  const raw = error.message.trim();
  const http = HTTP_STATUS.exec(raw);
  const status = http?.[1];
  const looksOffline =
    error.code === 'INTERNAL' ||
    NETWORK_HINT.test(raw) ||
    status === '500' ||
    status === '502' ||
    status === '503' ||
    status === '504';

  if (looksOffline) {
    return 'No hay conexión estable. Lo que ya fotografió o escribió sigue aquí; inténtelo de nuevo.';
  }

  if (error.code === 'CONFLICT' && /ya fue tomada/i.test(raw)) {
    return 'Otro mecánico ya tomó esta orden. La cola se actualizó.';
  }

  if (status) {
    return 'No se pudo completar la operación. Revise la orden e inténtelo de nuevo.';
  }

  return raw;
}

export function completeActionLabel(type: WorkOrderType): string {
  return type === 'INSTALLATION'
    ? 'Completar instalación'
    : `Completar ${UX_TERMS.dismantling.toLowerCase()}`;
}

/** Visible next step for the current order — one line, no commercial language. */
export function mechanicNextAction(order: MechanicWorkOrderView): string {
  if (order.status === 'COMPLETED') {
    return 'Trabajo terminado. La evidencia queda en el historial.';
  }

  if (order.status === 'CANCELLED') {
    return 'Esta orden fue cancelada. Ya no se puede completar ni agregar evidencia.';
  }

  if (order.status === 'PENDING') {
    return 'Tómela en Pendientes para asignársela y poder trabajarla.';
  }

  if (order.status === 'IN_PROGRESS' && !order.actions.canAddEvidence) {
    return 'Puede consultar el contexto técnico, pero no puede cargar evidencia ni completar.';
  }

  if (order.actions.canComplete) {
    return order.type === 'INSTALLATION'
      ? 'Cuando termine, complete la instalación.'
      : `Cuando termine, complete el ${UX_TERMS.dismantling.toLowerCase()}.`;
  }

  if (order.actions.canAddEvidence) {
    return 'Agregue al menos una foto de antes y una de después.';
  }

  return 'Revise el estado de la orden.';
}

export function mechanicCardActionLabel(
  order: MechanicWorkOrderView,
  canTakeHere: boolean,
): string {
  if (canTakeHere && order.actions.canTake) {
    return 'Tomar orden';
  }

  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
    return 'Ver historial';
  }

  if (order.status === 'IN_PROGRESS') {
    return 'Continuar';
  }

  return 'Ver orden';
}
