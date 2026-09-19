import type { CustomerListRow, SaveCustomerContactInput, SaveCustomerInput } from '../contracts/customers';
import type { CreditTermDays, Customer, CustomerContact, CustomerType } from '../contracts/entities';
import { LIST_PAGE_SIZE, type ListPage } from '../contracts/pagination';
import type { Result } from '../../shared/auth/types';
import { httpClient } from './http-client';
import { CSRF_HEADERS, request, type Page } from './http-result';
import { fetchAllPages } from './paginate-all';

const CUSTOMERS_PATH = '/api/customers';

type ApiCustomerContact = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  title: string | null;
  isPrimary: boolean;
};

type ApiCustomer = {
  id: string;
  name: string;
  customerType: CustomerType;
  creditLimitDop: string | null;
  creditTermDays: CreditTermDays | null;
  rnc: string | null;
  address: string | null;
  notes: string | null;
  isDefault: boolean;
  contacts: ApiCustomerContact[];
};

function optionalText(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

function toContact(contact: ApiCustomerContact): CustomerContact {
  return {
    id: contact.id,
    name: optionalText(contact.name),
    phone: optionalText(contact.phone),
    email: optionalText(contact.email),
    title: optionalText(contact.title),
    isPrimary: contact.isPrimary ? true : undefined,
  };
}

function toCustomer(customer: ApiCustomer): Customer {
  return {
    id: customer.id,
    name: customer.name,
    customerType: customer.customerType,
    creditLimitDop: optionalText(customer.creditLimitDop),
    creditTermDays: customer.creditTermDays ?? undefined,
    rnc: optionalText(customer.rnc),
    address: optionalText(customer.address),
    notes: optionalText(customer.notes),
    isDefault: customer.isDefault ? true : undefined,
    contacts: customer.contacts.map(toContact),
  };
}

function customersCollectionPath(
  query: string | undefined,
  page: number,
  customerType?: CustomerType,
): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(LIST_PAGE_SIZE),
  });
  const normalized = query?.trim();
  if (normalized) params.set('q', normalized);
  if (customerType) params.set('customerType', customerType);
  return `${CUSTOMERS_PATH}?${params.toString()}`;
}

/** Concatenate pages for POS lookups that still need the full directory. */
async function loadAllPages(query?: string): Promise<CustomerListRow[]> {
  return fetchAllPages(async (page) => {
    const response = await httpClient<Page<ApiCustomer>>(customersCollectionPath(query, page));
    return {
      items: response.items.map(toCustomer),
      total: response.total,
    };
  });
}

function toContactBody(contact: SaveCustomerContactInput) {
  return {
    ...(contact.id ? { id: contact.id } : {}),
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    title: contact.title,
    ...(contact.isPrimary ? { isPrimary: true } : {}),
  };
}

function toCustomerBody(input: SaveCustomerInput) {
  return {
    name: input.name,
    ...(input.customerType ? { customerType: input.customerType } : {}),
    ...(input.creditLimitDop !== undefined ? { creditLimitDop: input.creditLimitDop } : {}),
    ...(input.creditTermDays !== undefined ? { creditTermDays: input.creditTermDays } : {}),
    rnc: input.rnc,
    address: input.address,
    notes: input.notes,
    ...(input.contacts ? { contacts: input.contacts.map(toContactBody) } : {}),
  };
}

export function listCustomersWithHttp(): Promise<Result<CustomerListRow[]>> {
  return request(() => loadAllPages());
}

export function searchCustomersWithHttp(
  query: string,
  page = 1,
  customerType?: CustomerType,
): Promise<Result<ListPage<CustomerListRow>>> {
  return request(async () => {
    const response = await httpClient<Page<ApiCustomer>>(
      customersCollectionPath(query, page, customerType),
    );
    return {
      items: response.items.map(toCustomer),
      total: response.total,
      page: response.page,
      pageSize: response.pageSize,
    };
  });
}

export function getCustomerByIdWithHttp(id: string): Promise<Result<Customer>> {
  return request(async () => toCustomer(await httpClient<ApiCustomer>(`${CUSTOMERS_PATH}/${id}`)));
}

export function saveCustomerWithHttp(input: SaveCustomerInput): Promise<Result<Customer>> {
  const body = toCustomerBody(input);
  return request(async () =>
    toCustomer(
      await httpClient<ApiCustomer>(input.id ? `${CUSTOMERS_PATH}/${input.id}` : CUSTOMERS_PATH, {
        method: input.id ? 'PATCH' : 'POST',
        headers: CSRF_HEADERS,
        body: JSON.stringify(body),
      }),
    ),
  );
}
