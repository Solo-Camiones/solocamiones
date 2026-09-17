import type { AppState, Currency, Customer, WorkOrder } from '../../api/contracts/entities';
import { collectSubtree } from './inventory-helpers';

export const CASH_CUSTOMER_ID = 'C0';
export const CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE =
  'Las ventas de contado deben pagarse por completo al confirmar';
export const USD_INVOICE_MUST_BE_PAID_IN_FULL_MESSAGE =
  'Las facturas en USD deben pagarse por completo al confirmar';
export const SELLER_CREDIT_PAYMENT_FORBIDDEN_MESSAGE =
  'El Vendedor no puede registrar un pago al confirmar una venta a crédito';
export const CREDIT_LIMIT_EXCEEDED_MESSAGE =
  'El límite de crédito del cliente sería excedido';

const ACTIVE_WORK_STATUSES = new Set(['PENDING', 'IN_PROGRESS']);
const BUSINESS_DATE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santo_Domingo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function businessDateString(value: Date): string {
  const parts = BUSINESS_DATE_PARTS.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

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

export function confirmationRequiresFullPayment(
  customer: Pick<Customer, 'customerType' | 'isDefault'>,
  currency: Currency,
): boolean {
  return customer.customerType === 'CASH' || Boolean(customer.isDefault) || currency === 'USD';
}

export function isCreditDopConfirmation(
  customer: Pick<Customer, 'customerType' | 'isDefault'>,
  currency: Currency,
): boolean {
  return customer.customerType === 'CREDIT' && !customer.isDefault && currency === 'DOP';
}

/** Mirrors the API date-only policy: cash uses the confirmation day; credit uses its fixed term. */
export function confirmationDueDate(
  customer: Pick<Customer, 'customerType' | 'creditTermDays'>,
  currency: Currency,
  confirmedAtIso: string,
): string {
  const termDays =
    customer.customerType === 'CREDIT' && currency === 'DOP'
      ? (customer.creditTermDays ?? 0)
      : 0;
  const date = new Date(`${businessDateString(new Date(confirmedAtIso))}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + termDays);
  return date.toISOString().slice(0, 10);
}
