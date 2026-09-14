import { AppError } from '../../infrastructure/errors/app-error.js';
import { GENERIC_CUSTOMER_LOCKED_MESSAGE } from './constants.js';
import { toCustomerSnapshot, toPublicCustomer } from './projection.js';
import { assertCustomerManager } from './policies.js';
import {
  customerIdSchema,
  createCustomerSchema,
  searchCustomersSchema,
  updateCustomerSchema,
} from './validation.js';
import { customerTransaction, type CustomerTransaction } from './transaction.js';
import type { CreateCustomerRecord } from './types.js';

function contactsFromInput(contacts: CreateCustomerRecord['contacts']) {
  return (contacts ?? []).map((contact) => ({
    name: contact.name ?? null,
    phone: contact.phone ?? null,
    email: contact.email ?? null,
    title: contact.title ?? null,
    isPrimary: contact.isPrimary === true,
  }));
}

export class CustomerService {
  constructor(private readonly transaction: CustomerTransaction = customerTransaction) {}

  async create(actorId: string, input: unknown) {
    const profile = createCustomerSchema.parse(input);
    return this.transaction(async ({ customers, users, history }) => {
      assertCustomerManager(await users.findById(actorId));
      const customer = await customers.create({
        name: profile.name,
        rnc: profile.rnc ?? null,
        address: profile.address ?? null,
        notes: profile.notes ?? null,
        contacts: contactsFromInput(profile.contacts),
      });
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'CUSTOMER',
        subjectId: customer.id,
        eventType: 'CUSTOMER_CREATED',
        payload: toCustomerSnapshot(customer),
      });
      return toPublicCustomer(customer);
    });
  }

  async search(actorId: string, query: unknown) {
    const { q, page, pageSize } = searchCustomersSchema.parse(query);
    return this.transaction(async ({ customers, users }) => {
      assertCustomerManager(await users.findById(actorId));
      const result = await customers.search(q, page, pageSize);
      return { ...result, items: result.items.map(toPublicCustomer) };
    });
  }

  async getById(actorId: string, id: string) {
    customerIdSchema.parse({ id });
    return this.transaction(async ({ customers, users }) => {
      assertCustomerManager(await users.findById(actorId));
      const customer = await customers.findById(id);
      if (!customer) throw AppError.notFound('Customer not found');
      return toPublicCustomer(customer);
    });
  }

  async update(actorId: string, id: string, input: unknown) {
    customerIdSchema.parse({ id });
    const patch = updateCustomerSchema.parse(input);
    return this.transaction(async ({ customers, users, history }) => {
      assertCustomerManager(await users.findById(actorId));
      const existing = await customers.findById(id);
      if (!existing) throw AppError.notFound('Customer not found');
      if (existing.isDefault) throw AppError.conflict(GENERIC_CUSTOMER_LOCKED_MESSAGE);
      const updated = await customers.update(id, {
        name: patch.name,
        rnc: patch.rnc,
        address: patch.address,
        notes: patch.notes,
        contacts: patch.contacts === undefined ? undefined : contactsFromInput(patch.contacts),
      });
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'CUSTOMER',
        subjectId: id,
        eventType: 'CUSTOMER_UPDATED',
        payload: {
          before: toCustomerSnapshot(existing),
          after: toCustomerSnapshot(updated),
        },
      });
      return toPublicCustomer(updated);
    });
  }
}

export const customerService = new CustomerService();
