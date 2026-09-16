import {
  CREDIT_TERM_DAYS_OPTIONS,
  DEFAULT_CASH_CUSTOMER_ID,
  type CustomerListRow,
  type SaveCustomerContactInput,
  type SaveCustomerInput,
} from '../../api/contracts/customers';
import type { AppState, Customer, CustomerContact, CustomerType, Invoice, Role } from '../../api/contracts/entities';
import { err, ok, type Result } from '../../shared/auth/types';
import {
  CASH_CREDIT_FIELDS_FORBIDDEN_MESSAGE,
  CREDIT_CUSTOMER_DOWNGRADE_FORBIDDEN_MESSAGE,
  CREDIT_FISCAL_REQUIRED_MESSAGE,
  CREDIT_LIMIT_FORMAT_MESSAGE,
  CREDIT_LIMIT_REQUIRED_MESSAGE,
  CREDIT_TERM_REQUIRED_MESSAGE,
  INSUFFICIENT_PERMISSIONS_MESSAGE,
} from './customer-credit-messages';
import { isValidEmail } from './email';
import { invoiceBalance } from './invoice-money';

const CUSTOMER_ID_PATTERN = /^C(\d+)$/;
const CREDIT_TERM_VALUES = new Set<number>(CREDIT_TERM_DAYS_OPTIONS);
const CREDIT_LIMIT_PATTERN = /^\d+(\.\d{1,2})?$/;
const VALID_FISCAL_ID_DIGIT_COUNTS = new Set([9, 11]);

export type PrepareCustomerSaveContext = {
  actorRole: Role;
  invoices: Invoice[];
};

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isValidFiscalId(value: string): boolean {
  return VALID_FISCAL_ID_DIGIT_COUNTS.has(value.replace(/\D/g, '').length);
}

function matchesQuery(customer: Customer, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    customer.name.toLowerCase().includes(normalized) ||
    (customer.rnc?.toLowerCase().includes(normalized) ?? false)
  );
}

function matchesType(customer: Customer, customerType: CustomerType | undefined): boolean {
  if (!customerType) {
    return true;
  }
  return customer.customerType === customerType;
}

function sortDirectory(rows: CustomerListRow[]): CustomerListRow[] {
  return [...rows].sort((left, right) => {
    if (left.isDefault && !right.isDefault) {
      return -1;
    }
    if (!left.isDefault && right.isDefault) {
      return 1;
    }
    return left.name.localeCompare(right.name, 'es');
  });
}

/** Directory rows; search is name or RNC/Cédula only, optionally filtered by type. */
export function buildCustomerDirectory(
  state: AppState,
  query = '',
  customerType?: CustomerType,
): CustomerListRow[] {
  const rows = state.customers.filter(
    (customer) => matchesQuery(customer, query) && matchesType(customer, customerType),
  );
  return sortDirectory(rows);
}

export function customerHasOpenReceivableBalance(customerId: string, invoices: Invoice[]): boolean {
  return invoices.some(
    (invoice) =>
      invoice.customerId === customerId &&
      invoice.status === 'COMPLETED' &&
      invoice.currency === 'DOP' &&
      invoiceBalance(invoice) > 0,
  );
}

export function nextCustomerId(customers: Customer[]): string {
  let maxIndex = 0;

  for (const customer of customers) {
    const match = CUSTOMER_ID_PATTERN.exec(customer.id);
    if (!match) {
      continue;
    }
    maxIndex = Math.max(maxIndex, Number(match[1]));
  }

  return `C${maxIndex + 1}`;
}

function isProtectedCashCustomer(customer: Customer | undefined, id: string | undefined): boolean {
  return id === DEFAULT_CASH_CUSTOMER_ID || customer?.isDefault === true;
}

function allocateContactId(customerId: string, used: Set<string>): string {
  let index = 1;
  let candidate = `${customerId}-CT${index}`;

  while (used.has(candidate)) {
    index += 1;
    candidate = `${customerId}-CT${index}`;
  }

  used.add(candidate);
  return candidate;
}

function normalizeContact(input: SaveCustomerContactInput): Result<SaveCustomerContactInput> {
  const name = optionalText(input.name);
  const phone = optionalText(input.phone);
  const email = optionalText(input.email);
  if (!phone && !email) {
    return err({
      code: 'VALIDATION',
      message: 'Cada contacto debe tener teléfono o correo',
    });
  }

  if (email && !isValidEmail(email)) {
    return err({ code: 'VALIDATION', message: 'El correo no es válido' });
  }

  return ok({
    id: optionalText(input.id),
    name,
    phone,
    email,
    title: optionalText(input.title),
    isPrimary: input.isPrimary === true ? true : undefined,
  });
}

function prepareContacts(
  customerId: string,
  input: SaveCustomerContactInput[],
): Result<CustomerContact[]> {
  const primaryCount = input.filter((contact) => contact.isPrimary === true).length;
  if (primaryCount > 1) {
    return err({
      code: 'VALIDATION',
      message: 'Solo un contacto puede ser principal',
    });
  }

  const normalized: SaveCustomerContactInput[] = [];
  for (const contact of input) {
    const result = normalizeContact(contact);
    if (!result.ok) {
      return result;
    }
    normalized.push(result.value);
  }

  const usedIds = new Set<string>();
  for (const contact of normalized) {
    if (contact.id) {
      usedIds.add(contact.id);
    }
  }

  return ok(
    normalized.map((contact) => ({
      id: contact.id ?? allocateContactId(customerId, usedIds),
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      title: contact.title,
      isPrimary: contact.isPrimary,
    })),
  );
}

function parseCreditLimit(value: string | undefined): Result<string> {
  const trimmed = value?.trim();
  if (!trimmed) {
    return err({ code: 'VALIDATION', message: CREDIT_LIMIT_REQUIRED_MESSAGE });
  }
  if (!CREDIT_LIMIT_PATTERN.test(trimmed) || Number(trimmed) <= 0) {
    return err({ code: 'VALIDATION', message: CREDIT_LIMIT_FORMAT_MESSAGE });
  }
  return ok(trimmed);
}

function assertSellerCreditAccess(
  input: SaveCustomerInput,
  existing: Customer | undefined,
): Result<void> {
  if (input.customerType === 'CREDIT') {
    return err({ code: 'FORBIDDEN', message: INSUFFICIENT_PERMISSIONS_MESSAGE });
  }
  if (input.creditLimitDop !== undefined || input.creditTermDays !== undefined) {
    return err({ code: 'FORBIDDEN', message: INSUFFICIENT_PERMISSIONS_MESSAGE });
  }
  if (existing?.customerType === 'CREDIT') {
    return err({ code: 'FORBIDDEN', message: INSUFFICIENT_PERMISSIONS_MESSAGE });
  }
  return ok(undefined);
}

function resolveCustomerType(
  input: SaveCustomerInput,
  existing: Customer | undefined,
  actorRole: Role,
): CustomerType {
  if (actorRole === 'SELLER') {
    return existing?.customerType ?? 'CASH';
  }
  return input.customerType ?? existing?.customerType ?? 'CASH';
}

function applyCreditFields(
  customerType: CustomerType,
  input: SaveCustomerInput,
  existing: Customer | undefined,
): Result<Pick<Customer, 'creditLimitDop' | 'creditTermDays'>> {
  if (customerType === 'CASH') {
    if (input.creditLimitDop !== undefined || input.creditTermDays !== undefined) {
      return err({ code: 'VALIDATION', message: CASH_CREDIT_FIELDS_FORBIDDEN_MESSAGE });
    }
    return ok({});
  }

  const rnc = optionalText(input.rnc) ?? existing?.rnc;
  if (!rnc || !isValidFiscalId(rnc)) {
    return err({ code: 'VALIDATION', message: CREDIT_FISCAL_REQUIRED_MESSAGE, details: { issues: [{ path: 'rnc', message: CREDIT_FISCAL_REQUIRED_MESSAGE }] } });
  }

  const limitSource = input.creditLimitDop ?? existing?.creditLimitDop;
  const limit = parseCreditLimit(limitSource);
  if (!limit.ok) {
    return limit;
  }

  const term = input.creditTermDays ?? existing?.creditTermDays;
  if (term === undefined || !CREDIT_TERM_VALUES.has(term)) {
    return err({ code: 'VALIDATION', message: CREDIT_TERM_REQUIRED_MESSAGE, details: { issues: [{ path: 'creditTermDays', message: CREDIT_TERM_REQUIRED_MESSAGE }] } });
  }

  return ok({ creditLimitDop: limit.value, creditTermDays: term });
}

/**
 * Validates create/edit and returns the record to upsert.
 * Caller persists; this function does not mutate state.
 */
export function prepareCustomerSave(
  customers: Customer[],
  input: SaveCustomerInput,
  context: PrepareCustomerSaveContext,
): Result<Customer> {
  const name = input.name.trim();
  if (!name) {
    return err({ code: 'VALIDATION', message: 'El nombre es obligatorio' });
  }

  const existing = input.id ? customers.find((entry) => entry.id === input.id) : undefined;

  if (input.id && !existing) {
    return err({ code: 'NOT_FOUND', message: 'Cliente no encontrado' });
  }

  if (isProtectedCashCustomer(existing, input.id)) {
    return err({
      code: 'VALIDATION',
      message: 'Cliente Contado es el predeterminado y no se puede editar',
    });
  }

  if (context.actorRole === 'SELLER') {
    const sellerCheck = assertSellerCreditAccess(input, existing);
    if (!sellerCheck.ok) {
      return sellerCheck;
    }
  }

  const customerType = resolveCustomerType(input, existing, context.actorRole);

  if (
    existing?.customerType === 'CREDIT' &&
    customerType === 'CASH' &&
    customerHasOpenReceivableBalance(existing.id, context.invoices)
  ) {
    return err({
      code: 'CONFLICT',
      message: CREDIT_CUSTOMER_DOWNGRADE_FORBIDDEN_MESSAGE,
    });
  }

  const creditFields = applyCreditFields(customerType, input, existing);
  if (!creditFields.ok) {
    return creditFields;
  }

  const customerId = existing?.id ?? nextCustomerId(customers);
  const contactInput = input.contacts ?? existing?.contacts ?? [];
  const contacts = prepareContacts(customerId, contactInput);
  if (!contacts.ok) {
    return contacts;
  }

  const customer: Customer = {
    id: customerId,
    name,
    customerType,
    rnc: optionalText(input.rnc),
    address: optionalText(input.address),
    notes: optionalText(input.notes),
    contacts: contacts.value,
    ...(creditFields.value.creditLimitDop
      ? { creditLimitDop: creditFields.value.creditLimitDop }
      : {}),
    ...(creditFields.value.creditTermDays
      ? { creditTermDays: creditFields.value.creditTermDays }
      : {}),
  };

  return ok(customer);
}
