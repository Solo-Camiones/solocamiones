import type { Customer, CustomerContact } from './entities';

/** Seed and runtime id of the generic cash customer (CUST-002). */
export const DEFAULT_CASH_CUSTOMER_ID = 'C0';

export type CustomerListRow = Customer;

export type SaveCustomerContactInput = {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  title?: string;
  isPrimary?: boolean;
};

export type SaveCustomerInput = {
  id?: string;
  name: string;
  rnc?: string;
  address?: string;
  notes?: string;
  contacts?: SaveCustomerContactInput[];
};

export type { CustomerContact };
