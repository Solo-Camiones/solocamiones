import type { AppState, Currency, Customer, User, WorkOrder } from '../../api/contracts/entities';
import { err, ok, type Result } from '../../shared/auth/types';
import { businessDateString } from '../../shared/domain/business-date';
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

/** Named CASH (not default Cliente contado) — Admin conduce balance exception (CON-002). */
export function isNamedCashCustomer(
  customer: Pick<Customer, 'customerType' | 'isDefault'>,
): boolean {
  return customer.customerType === 'CASH' && !customer.isDefault;
}

/**
 * CON-002: Admin may leave balance on named CASH DOP/USD conduces only.
 * Default Cliente contado, Seller, and CREDIT USD still require full settlement.
 */
export function conduceRequiresFullPayment(
  customer: Pick<Customer, 'customerType' | 'isDefault'>,
  currency: Currency,
  actorRole: User['role'],
): boolean {
  if (actorRole === 'ADMINISTRATOR' && isNamedCashCustomer(customer)) {
    return false;
  }
  return confirmationRequiresFullPayment(customer, currency);
}

export const CONDUCE_DUE_DATE_REQUIRED_MESSAGE =
  'Indique la fecha de vencimiento cuando el conduce de contado queda con saldo';
export const CONDUCE_DUE_DATE_BEFORE_EMISSION_MESSAGE =
  'La fecha de vencimiento no puede ser anterior al día de emisión';
export const CONDUCE_DUE_DATE_NOT_ALLOWED_MESSAGE =
  'La fecha de vencimiento solo aplica cuando el Administrador deja saldo en un cliente de contado nombrado';

/**
 * Resolves dueDate for conduce emission (mock mirror of API CON-002).
 * Admin named-CASH with open balance: actor-supplied calendar day ≥ emission day.
 */
export function resolveConduceDueDate(input: {
  customer: Pick<Customer, 'customerType' | 'isDefault' | 'creditTermDays'>;
  currency: Currency;
  actorRole: User['role'];
  confirmedAtIso: string;
  newBalance: number;
  actorDueDate: string | undefined;
}): Result<string> {
  const { customer, currency, actorRole, confirmedAtIso, newBalance, actorDueDate } = input;
  const needsActorDueDate =
    actorRole === 'ADMINISTRATOR' && isNamedCashCustomer(customer) && newBalance > 0;

  if (needsActorDueDate) {
    if (actorDueDate == null || actorDueDate.trim() === '') {
      return err({ code: 'CONFLICT', message: CONDUCE_DUE_DATE_REQUIRED_MESSAGE });
    }
    const emissionDay = businessDateString(new Date(confirmedAtIso));
    if (actorDueDate < emissionDay) {
      return err({ code: 'CONFLICT', message: CONDUCE_DUE_DATE_BEFORE_EMISSION_MESSAGE });
    }
    return ok(actorDueDate);
  }

  if (actorDueDate != null && actorDueDate.trim() !== '') {
    return err({ code: 'CONFLICT', message: CONDUCE_DUE_DATE_NOT_ALLOWED_MESSAGE });
  }

  return ok(confirmationDueDate(customer, currency, confirmedAtIso));
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
