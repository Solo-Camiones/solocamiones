import {
  DEFAULT_CASH_CUSTOMER_ID,
  type CustomerListRow,
  type SaveCustomerContactInput,
  type SaveCustomerInput,
} from '../../api/contracts/customers';
import type { AppState, Customer, CustomerContact } from '../../api/contracts/entities';
import { err, ok, type Result } from '../../shared/auth/types';

const CUSTOMER_ID_PATTERN = /^C(\d+)$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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

/** Directory rows; search is name or RNC/Cédula only. */
export function buildCustomerDirectory(state: AppState, query = ''): CustomerListRow[] {
  const rows = state.customers.filter((customer) => matchesQuery(customer, query));
  return sortDirectory(rows);
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

  if (email && !EMAIL_PATTERN.test(email)) {
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

/**
 * Validates create/edit and returns the record to upsert.
 * Caller persists; this function does not mutate state.
 */
export function prepareCustomerSave(
  customers: Customer[],
  input: SaveCustomerInput,
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

  const customerId = existing?.id ?? nextCustomerId(customers);
  const contactInput = input.contacts ?? existing?.contacts ?? [];
  const contacts = prepareContacts(customerId, contactInput);
  if (!contacts.ok) {
    return contacts;
  }

  const customer: Customer = {
    id: customerId,
    name,
    rnc: optionalText(input.rnc),
    address: optionalText(input.address),
    notes: optionalText(input.notes),
    contacts: contacts.value,
  };

  return ok(customer);
}
