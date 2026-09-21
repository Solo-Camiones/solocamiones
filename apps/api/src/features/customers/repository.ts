import type { Customer, CustomerContact, CustomerType, Prisma } from '@prisma/client';
import { Prisma as PrismaNamespace } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import { fiscalIdDigits } from './fiscal.js';
import type {
  CompletedInvoicePaymentSummary,
  CreateCustomerRecord,
  UpdateCustomerRecord,
} from './types.js';

type CustomerDatabase = Pick<
  Prisma.TransactionClient,
  'customer' | 'customerContact' | 'invoice' | '$queryRaw'
>;
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

function creditLimitData(value: string | null | undefined): PrismaNamespace.Decimal | null {
  if (value == null) return null;
  return new PrismaNamespace.Decimal(value);
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
        customerType: input.customerType ?? 'CASH',
        creditLimitDop: creditLimitData(input.creditLimitDop),
        creditTermDays: input.creditTermDays ?? null,
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

  async lockById(id: string): Promise<void> {
    await this.database.$queryRaw`
      SELECT "id"
      FROM "Customer"
      WHERE "id" = ${id}::uuid
      FOR UPDATE
    `;
  }

  findDefault(): Promise<CustomerRecord | null> {
    return this.database.customer.findFirst({
      where: { isDefault: true },
      include: { contacts: true },
    });
  }

  findCompletedInvoicesWithPayments(customerId: string): Promise<CompletedInvoicePaymentSummary[]> {
    return this.database.invoice.findMany({
      // Open CONDUCE balances count toward credit limit once the sale is recognized (CON-002).
      where: { customerId, status: { in: ['COMPLETED', 'CONDUCE'] }, currency: 'DOP' },
      select: {
        status: true,
        gross: true,
        dueDate: true,
        payments: true,
      },
    }) as Promise<CompletedInvoicePaymentSummary[]>;
  }

  async search(
    query: string | undefined,
    page: number,
    pageSize: number,
    customerType?: CustomerType,
  ) {
    const where = this.searchWhere(query, customerType);
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
        ...(input.customerType !== undefined ? { customerType: input.customerType } : {}),
        ...(input.creditLimitDop !== undefined
          ? { creditLimitDop: creditLimitData(input.creditLimitDop) }
          : {}),
        ...(input.creditTermDays !== undefined ? { creditTermDays: input.creditTermDays } : {}),
        ...(input.contacts ? { contacts: { create: contactCreates(input.contacts) } } : {}),
      },
      include: { contacts: true },
    });
  }

  private searchWhere(
    query: string | undefined,
    customerType?: CustomerType,
  ): Prisma.CustomerWhereInput {
    const filters: Prisma.CustomerWhereInput[] = [];
    if (customerType) filters.push({ customerType });

    const normalized = query?.trim();
    if (normalized) {
      const digits = fiscalIdDigits(normalized);
      const textFilters: Prisma.CustomerWhereInput[] = [
        { name: { contains: normalized, mode: 'insensitive' } },
        { rnc: { contains: normalized, mode: 'insensitive' } },
      ];
      if (digits && digits !== normalized) {
        textFilters.push({ rnc: { contains: digits } });
      }
      filters.push({ OR: textFilters });
    }

    if (filters.length === 0) return {};
    if (filters.length === 1) return filters[0]!;
    return { AND: filters };
  }
}
