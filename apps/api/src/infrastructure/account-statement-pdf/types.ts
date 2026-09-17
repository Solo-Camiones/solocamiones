import type { PaymentState } from '../../features/payments/summary.js';

export type AccountStatementRow = {
  number: string;
  issuedAt: Date;
  dueDate: Date;
  paymentState: Exclude<PaymentState, 'PAID' | 'PAID_LATE' | 'CANCELLED'>;
  invoiced: string;
  paid: string;
  balance: string;
};

export type AccountStatementPdfFacts = {
  customerName: string;
  customerRnc: string | null;
  generatedAt: Date;
  rows: AccountStatementRow[];
  totals: {
    invoiced: string;
    paid: string;
    balance: string;
  };
};

export type AccountStatementPdfRenderer = {
  render(facts: AccountStatementPdfFacts): Promise<Buffer>;
};
