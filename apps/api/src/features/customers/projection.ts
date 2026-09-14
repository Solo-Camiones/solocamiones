import type { Customer, CustomerContact } from '@prisma/client';

import type { CustomerSnapshot, PublicCustomer, PublicCustomerContact } from './types.js';

type CustomerWithContacts = Customer & { contacts: CustomerContact[] };

function toPublicContact(contact: CustomerContact): PublicCustomerContact {
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    title: contact.title,
    isPrimary: contact.isPrimary,
  };
}

function sortContacts(contacts: CustomerContact[]): CustomerContact[] {
  return [...contacts].sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
}

export function toPublicCustomer(customer: CustomerWithContacts): PublicCustomer {
  return {
    id: customer.id,
    name: customer.name,
    rnc: customer.rnc,
    address: customer.address,
    notes: customer.notes,
    isDefault: customer.isDefault,
    contacts: sortContacts(customer.contacts).map(toPublicContact),
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

export function toCustomerSnapshot(customer: CustomerWithContacts): CustomerSnapshot {
  return {
    name: customer.name,
    rnc: customer.rnc,
    address: customer.address,
    notes: customer.notes,
    isDefault: customer.isDefault,
    contacts: sortContacts(customer.contacts).map((contact) => ({
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      title: contact.title,
      isPrimary: contact.isPrimary,
    })),
  };
}
