import type { Customer, CustomerContact, Prisma } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import { fiscalIdDigits } from './fiscal.js';
import type { CreateCustomerRecord, UpdateCustomerRecord } from './types.js';

type CustomerDatabase = Pick<Prisma.TransactionClient, 'customer' | 'customerContact'>;
export type CustomerRecord = Customer & { contacts: CustomerContact[] };

function contactCreates(contacts: NonNullable<CreateCustomerRecord['contacts']>) {
  return contacts.map((contact) => ({
    name: contact.name ?? null,
    phone: contact.phone ?? null,
    email: contact.email ?? null,
    title: contact.title ?? null,
    isPrimary: contact.isPrimary === true,
  }));
}

export class CustomerRepository {
  constructor(private readonly database: CustomerDatabase = prisma) {}

  create(input: CreateCustomerRecord): Promise<CustomerRecord> {
    return this.database.customer.create({
      data: {
        name: input.name,
        rnc: input.rnc ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        contacts: input.contacts ? { create: contactCreates(input.contacts) } : undefined,
      },
      include: { contacts: true },
    });
  }

  findById(id: string): Promise<CustomerRecord | null> {
    return this.database.customer.findUnique({
      where: { id },
      include: { contacts: true },
    });
  }

  findDefault(): Promise<CustomerRecord | null> {
    return this.database.customer.findFirst({
      where: { isDefault: true },
      include: { contacts: true },
    });
  }

  async search(query: string | undefined, page: number, pageSize: number) {
    const where = this.searchWhere(query);
    const items = await this.database.customer.findMany({
      where,
      include: { contacts: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return {
      items,
      total: await this.database.customer.count({ where }),
      page,
      pageSize,
    };
  }

  async update(id: string, input: UpdateCustomerRecord): Promise<CustomerRecord> {
    if (input.contacts) {
      await this.database.customerContact.deleteMany({ where: { customerId: id } });
    }

    return this.database.customer.update({
      where: { id },
      data: {
        name: input.name,
        ...(input.rnc !== undefined ? { rnc: input.rnc } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.contacts ? { contacts: { create: contactCreates(input.contacts) } } : {}),
      },
      include: { contacts: true },
    });
  }

  private searchWhere(query: string | undefined): Prisma.CustomerWhereInput {
    const normalized = query?.trim();
    if (!normalized) return {};

    const digits = fiscalIdDigits(normalized);
    const filters: Prisma.CustomerWhereInput[] = [
      { name: { contains: normalized, mode: 'insensitive' } },
      { rnc: { contains: normalized, mode: 'insensitive' } },
    ];
    if (digits && digits !== normalized) {
      filters.push({ rnc: { contains: digits } });
    }
    return { OR: filters };
  }
}
