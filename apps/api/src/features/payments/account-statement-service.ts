import { Prisma } from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  pdfkitAccountStatementRenderer,
  type AccountStatementPdfRenderer,
} from '../../infrastructure/account-statement-pdf/index.js';
import { statementCustomerIdSchema } from '../sales/validation.js';
import { salesTransaction, type SalesTransaction } from '../sales/transaction.js';
import { assertAdministrator } from '../users/policies.js';
import { moneyString } from './receivables.js';
import { summarizePayments } from './summary.js';

export const ACCOUNT_STATEMENT_NO_BALANCE_MESSAGE =
  'Customer has no open DOP balance for an account statement';

function filenamePart(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return normalized || 'cliente';
}

export class AccountStatementService {
  constructor(
    private readonly transaction: SalesTransaction = salesTransaction,
    private readonly renderer: AccountStatementPdfRenderer = pdfkitAccountStatementRenderer,
  ) {}

  async download(actorId: string, customerId: string) {
    statementCustomerIdSchema.parse({ customerId });
    const generatedAt = new Date();
    const loaded = await this.transaction(async ({ customers, sales, users }) => {
      assertAdministrator(await users.findById(actorId));
      const customer = await customers.findById(customerId);
      if (!customer) throw AppError.notFound('Customer not found');
      const invoices = await sales.listOpenDopInvoicesByCustomer(customerId);
      return { customer, invoices };
    });
    const rows = loaded.invoices.flatMap((invoice) => {
      const summary = summarizePayments(invoice, generatedAt);
      if (
        !summary.balance.greaterThan(0) ||
        summary.state === 'PAID' ||
        summary.state === 'PAID_LATE' ||
        summary.state === 'CANCELLED'
      ) {
        return [];
      }
      return [
        {
          invoice,
          invoiced: invoice.gross ?? new Prisma.Decimal(0),
          paid: summary.paid,
          balance: summary.balance,
          state: summary.state,
        },
      ];
    });
    if (rows.length === 0) throw AppError.conflict(ACCOUNT_STATEMENT_NO_BALANCE_MESSAGE);

    const totals = rows.reduce(
      (sum, row) => ({
        invoiced: sum.invoiced.plus(row.invoiced),
        paid: sum.paid.plus(row.paid),
        balance: sum.balance.plus(row.balance),
      }),
      {
        invoiced: new Prisma.Decimal(0),
        paid: new Prisma.Decimal(0),
        balance: new Prisma.Decimal(0),
      },
    );
    const body = await this.renderer.render({
      customerName: loaded.customer.name,
      customerRnc: loaded.customer.rnc,
      generatedAt,
      rows: rows.map((row) => ({
        number: row.invoice.number!,
        issuedAt: row.invoice.confirmedAt!,
        dueDate: row.invoice.dueDate!,
        paymentState: row.state,
        invoiced: moneyString(row.invoiced),
        paid: moneyString(row.paid),
        balance: moneyString(row.balance),
      })),
      totals: {
        invoiced: moneyString(totals.invoiced),
        paid: moneyString(totals.paid),
        balance: moneyString(totals.balance),
      },
    });
    return {
      filename: `estado-de-cuenta-${filenamePart(loaded.customer.name)}.pdf`,
      contentType: 'application/pdf',
      body,
    };
  }
}
