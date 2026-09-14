import { Prisma, type InvoiceLineType, type Role } from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE,
  FIXED_LINE_QUANTITY_MESSAGE,
  LINE_COST_NOT_EDITABLE_MESSAGE,
  LINE_DESCRIPTION_NOT_EDITABLE_MESSAGE,
  UNSUPPORTED_INVENTORY_LINE_MESSAGE,
  UNSUPPORTED_LINE_TYPE_MESSAGE,
} from './constants.js';

const INVOICE_MANAGER_ROLES: ReadonlySet<Role> = new Set(['ADMINISTRATOR', 'SELLER']);
const INVENTORY_LINE_TYPES = new Set<InvoiceLineType>(['ITEM', 'QTY']);
const ENABLED_DRAFT_LINE_TYPES = new Set<InvoiceLineType>([
  'GENERIC',
  'SERVICE',
  'DELIVERY',
  'EXTERNAL',
]);
const QUANTITY_EDITABLE_DRAFT_LINE_TYPES = new Set<InvoiceLineType>(['GENERIC', 'EXTERNAL']);
const DESCRIPTION_EDITABLE_DRAFT_LINE_TYPES = new Set<InvoiceLineType>([
  'GENERIC',
  'EXTERNAL',
  'DELIVERY',
]);
const COST_EDITABLE_DRAFT_LINE_TYPES = new Set<InvoiceLineType>(['GENERIC', 'EXTERNAL']);

type InvoiceManager = {
  active: boolean;
  role: Role;
  mustChangePassword: boolean;
  name: string;
};

export function assertInvoiceManager(user: InvoiceManager | null): void {
  requireInvoiceManager(user);
}

export function requireInvoiceManager(user: InvoiceManager | null): InvoiceManager {
  if (!user?.active) throw AppError.unauthorized();
  if (user.mustChangePassword) {
    throw new AppError('FORBIDDEN', 'Password change required', {
      reason: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  if (!INVOICE_MANAGER_ROLES.has(user.role)) throw AppError.forbidden();
  return user;
}

export function assertDraftLineTypeEnabled(type: InvoiceLineType): void {
  if (INVENTORY_LINE_TYPES.has(type)) {
    throw AppError.conflict(UNSUPPORTED_INVENTORY_LINE_MESSAGE, { type });
  }
  if (!ENABLED_DRAFT_LINE_TYPES.has(type)) {
    throw AppError.conflict(UNSUPPORTED_LINE_TYPE_MESSAGE, { type });
  }
}

export function assertDraftLineQuantityEditable(type: InvoiceLineType): void {
  if (!QUANTITY_EDITABLE_DRAFT_LINE_TYPES.has(type)) {
    throw AppError.conflict(FIXED_LINE_QUANTITY_MESSAGE, { type });
  }
}

export function assertDraftLineDescriptionEditable(type: InvoiceLineType): void {
  if (!DESCRIPTION_EDITABLE_DRAFT_LINE_TYPES.has(type)) {
    throw AppError.conflict(LINE_DESCRIPTION_NOT_EDITABLE_MESSAGE, { type });
  }
}

export function assertDraftLineCostEditable(type: InvoiceLineType): void {
  if (!COST_EDITABLE_DRAFT_LINE_TYPES.has(type)) {
    throw AppError.conflict(LINE_COST_NOT_EDITABLE_MESSAGE, { type });
  }
}

/** Cliente contado is cash-only: confirmation must settle the invoice in full. */
export function assertCashCustomerPaidInFull(
  customer: { isDefault: boolean },
  invoiceGross: Prisma.Decimal,
  initialPaymentAmount: Prisma.Decimal | null,
): void {
  if (!customer.isDefault || invoiceGross.isZero()) {
    return;
  }
  if (initialPaymentAmount == null || !initialPaymentAmount.equals(invoiceGross)) {
    throw AppError.conflict(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);
  }
}
