import type { CreditTermDays, Customer, CustomerContact, CustomerType } from './entities';

export type { CreditTermDays, CustomerType };

export const CREDIT_TERM_DAYS_OPTIONS: readonly CreditTermDays[] = [30, 45, 60, 90, 120];

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
  customerType?: CustomerType;
  creditLimitDop?: string;
  creditTermDays?: CreditTermDays;
  rnc?: string;
  address?: string;
  notes?: string;
  contacts?: SaveCustomerContactInput[];
};

export type { CustomerContact };
