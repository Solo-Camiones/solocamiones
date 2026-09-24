import { Prisma } from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  ASSISTANT_APP_PATHS,
  assistantToolSourceKey,
} from '../assistant/tools/constants.js';
import type {
  GetCustomerCommercialSummaryInput,
  SearchCustomersInput,
} from '../assistant/tools/schemas.js';
import { moneyString } from '../payments/receivables.js';
import { summarizePayments } from '../payments/summary.js';
import { salesTransaction, type SalesTransaction } from '../sales/transaction.js';
import { assertAdministrator } from '../users/policies.js';
import type {
  AssistantCustomerCommercialSummary,
  AssistantCustomerSearchResult,
} from './assistant-query-types.js';
import { customerTransaction, type CustomerTransaction } from './transaction.js';

function formatCreditLimit(value: Prisma.Decimal | null): string | null {
  if (value == null) return null;
  return value.toFixed(2);
}

export class CustomersAssistantQueryService {
  constructor(
    private readonly customersTx: CustomerTransaction = customerTransaction,
    private readonly salesTx: SalesTransaction = salesTransaction,
  ) {}

  async searchCustomers(
    actorId: string,
    input: SearchCustomersInput,
    now = new Date(),
  ): Promise<AssistantCustomerSearchResult> {
    return this.customersTx(async ({ customers, users }) => {
      assertAdministrator(await users.findById(actorId));
      const items = await customers.searchForAssistant(
        input.query,
        input.limit,
        input.customerType,
      );
      return {
        items: items.map((item) => ({
          ...item,
          appPath: ASSISTANT_APP_PATHS.customers,
        })),
        asOf: now.toISOString(),
        sourceKey: assistantToolSourceKey('searchCustomers'),
      };
    });
  }

  async getCommercialSummary(
    actorId: string,
    input: GetCustomerCommercialSummaryInput,
    now = new Date(),
  ): Promise<AssistantCustomerCommercialSummary> {
    return this.salesTx(async ({ customers, sales, users }) => {
      assertAdministrator(await users.findById(actorId));
      const customer = await customers.findIdentityForAssistant(input.customerId);
      if (!customer) throw AppError.notFound('Customer not found');

      const openInvoices = await sales.listOpenInvoicesForAssistantCustomer(input.customerId);
      let openBalanceDop = new Prisma.Decimal(0);
      let openBalanceUsd = new Prisma.Decimal(0);
      let openDocumentCount = 0;
      for (const invoice of openInvoices) {
        const summary = summarizePayments(invoice, now);
        if (!summary.balance.greaterThan(0)) continue;
        if (
          summary.state !== 'PENDING' &&
          summary.state !== 'PARTIALLY_PAID' &&
          summary.state !== 'OVERDUE' &&
          summary.state !== 'PARTIALLY_PAID_OVERDUE'
        ) {
          continue;
        }
        openDocumentCount += 1;
        if (invoice.currency === 'USD') {
          openBalanceUsd = openBalanceUsd.plus(summary.balance);
        } else {
          openBalanceDop = openBalanceDop.plus(summary.balance);
        }
      }

      const base: AssistantCustomerCommercialSummary = {
        id: customer.id,
        name: customer.name,
        customerType: customer.customerType,
        isDefault: customer.isDefault,
        creditLimitDop: formatCreditLimit(customer.creditLimitDop),
        creditTermDays: customer.creditTermDays,
        openBalanceDop: moneyString(openBalanceDop),
        openBalanceUsd: moneyString(openBalanceUsd),
        openDocumentCount,
        appPath: ASSISTANT_APP_PATHS.customers,
        asOf: now.toISOString(),
        sourceKey: assistantToolSourceKey('getCustomerCommercialSummary'),
      };

      if (customer.customerType !== 'CREDIT') return base;

      // Credit exposure is DOP-only recognized open balances (same basis as confirmation).
      const dopExposureInvoices = await customers.findCompletedInvoicesWithPayments(customer.id);
      const creditExposureUsedDop = dopExposureInvoices.reduce(
        (sum, invoice) => sum.plus(summarizePayments(invoice, now).balance),
        new Prisma.Decimal(0),
      );
      const remaining =
        customer.creditLimitDop == null
          ? null
          : Prisma.Decimal.max(customer.creditLimitDop.minus(creditExposureUsedDop), 0);

      return {
        ...base,
        creditExposureUsedDop: moneyString(creditExposureUsedDop),
        creditRemainingDop: remaining == null ? null : moneyString(remaining),
      };
    });
  }
}
