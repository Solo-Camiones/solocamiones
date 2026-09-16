import { AppError } from '../../infrastructure/errors/app-error.js';
import { summarizePayments } from '../payments/summary.js';
import { CREDIT_TO_CASH_OPEN_BALANCE_MESSAGE, GENERIC_CUSTOMER_LOCKED_MESSAGE } from './constants.js';
import {
  assertCustomerCreditProfile,
  resolveCreateCreditProfile,
  resolveUpdateCreditProfile,
} from './credit-rules.js';
import { toCustomerSnapshot, toPublicCustomer } from './projection.js';
import {
  assertCustomerManager,
  assertSellerMayUpdateCustomer,
  assertSellerMayWriteCreditFields,
} from './policies.js';
import {
  customerIdSchema,
  createCustomerSchema,
  searchCustomersSchema,
  updateCustomerSchema,
} from './validation.js';
import { customerTransaction, type CustomerTransaction } from './transaction.js';
import type { CompletedInvoicePaymentSummary, CreateCustomerRecord } from './types.js';
import type { CustomerRecord } from './repository.js';

function contactsFromInput(contacts: CreateCustomerRecord['contacts']) {
  return (contacts ?? []).map((contact) => ({
    name: contact.name ?? null,
    phone: contact.phone ?? null,
    email: contact.email ?? null,
    title: contact.title ?? null,
    isPrimary: contact.isPrimary === true,
  }));
}

function formatStoredCreditLimit(customer: CustomerRecord): string | null {
  if (customer.creditLimitDop == null) return null;
  return customer.creditLimitDop.toFixed(2);
}

function hasOutstandingCompletedBalance(invoices: CompletedInvoicePaymentSummary[]): boolean {
  return invoices.some((invoice) =>
    summarizePayments({
      status: invoice.status,
      gross: invoice.gross,
      dueDate: invoice.dueDate,
      payments: invoice.payments,
    }).balance.greaterThan(0),
  );
}

export class CustomerService {
  constructor(private readonly transaction: CustomerTransaction = customerTransaction) {}

  async create(actorId: string, input: unknown) {
    const profile = createCustomerSchema.parse(input);
    return this.transaction(async ({ customers, users, history }) => {
      const user = await users.findById(actorId);
      assertCustomerManager(user);
      assertSellerMayWriteCreditFields(user!.role, profile);

      const creditProfile = resolveCreateCreditProfile({
        customerType: profile.customerType,
        creditLimitDop: profile.creditLimitDop,
        creditTermDays: profile.creditTermDays,
        rnc: profile.rnc,
      });
      assertCustomerCreditProfile(creditProfile);

      const customer = await customers.create({
        name: profile.name,
        rnc: profile.rnc ?? null,
        address: profile.address ?? null,
        notes: profile.notes ?? null,
        customerType: creditProfile.customerType,
        creditLimitDop: creditProfile.creditLimitDop,
        creditTermDays: creditProfile.creditTermDays,
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
    const { q, page, pageSize, customerType } = searchCustomersSchema.parse(query);
    return this.transaction(async ({ customers, users }) => {
      assertCustomerManager(await users.findById(actorId));
      const result = await customers.search(q, page, pageSize, customerType);
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
      const user = await users.findById(actorId);
      assertCustomerManager(user);
      const existing = await customers.findById(id);
      if (!existing) throw AppError.notFound('Customer not found');
      if (existing.isDefault) throw AppError.conflict(GENERIC_CUSTOMER_LOCKED_MESSAGE);

      assertSellerMayUpdateCustomer(user!.role, existing, patch);

      const creditProfile = resolveUpdateCreditProfile(
        {
          customerType: existing.customerType,
          creditLimitDop: formatStoredCreditLimit(existing),
          creditTermDays: existing.creditTermDays,
          rnc: existing.rnc,
          isDefault: existing.isDefault,
        },
        {
          customerType: patch.customerType,
          creditLimitDop: patch.creditLimitDop,
          creditTermDays: patch.creditTermDays,
          rnc: patch.rnc,
        },
      );
      assertCustomerCreditProfile(creditProfile);

      if (existing.customerType === 'CREDIT' && creditProfile.customerType === 'CASH') {
        const invoices = await customers.findCompletedInvoicesWithPayments(id);
        if (hasOutstandingCompletedBalance(invoices)) {
          throw AppError.conflict(CREDIT_TO_CASH_OPEN_BALANCE_MESSAGE);
        }
      }

      const updated = await customers.update(id, {
        name: patch.name,
        rnc: patch.rnc,
        address: patch.address,
        notes: patch.notes,
        customerType: creditProfile.customerType,
        creditLimitDop: creditProfile.creditLimitDop,
        creditTermDays: creditProfile.creditTermDays,
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
