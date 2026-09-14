import type { AppState, Customer, WorkOrder } from '../../api/contracts/entities';
import { collectSubtree } from './inventory-helpers';

export const CASH_CUSTOMER_ID = 'C0';
export const CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE =
  'A Cliente contado no se le puede vender a crédito';

const ACTIVE_WORK_STATUSES = new Set(['PENDING', 'IN_PROGRESS']);

/** SALE-008: pending/in-progress work on the subtree or an installation into it. */
export function activeWorkAffectingAssembly(
  state: AppState,
  rootId: string,
): WorkOrder | undefined {
  const subtree = new Set([rootId, ...collectSubtree(state.items, rootId).map((item) => item.id)]);

  return state.workOrders.find((order) => {
    if (!ACTIVE_WORK_STATUSES.has(order.status)) {
      return false;
    }
    if (subtree.has(order.pieceId)) {
      return true;
    }
    return Boolean(order.destinationParentId && subtree.has(order.destinationParentId));
  });
}

/** Fiscal invoices need a named customer with RNC/cédula — Cliente Contado never qualifies. */
export function customerQualifiesForFiscal(customer: Customer | undefined): boolean {
  if (!customer || isCashCustomer(customer)) {
    return false;
  }
  return Boolean(customer.rnc?.trim());
}

export function isCashCustomer(customer: Pick<Customer, 'id' | 'isDefault'> | undefined): boolean {
  return Boolean(customer && (customer.id === CASH_CUSTOMER_ID || customer.isDefault));
}
