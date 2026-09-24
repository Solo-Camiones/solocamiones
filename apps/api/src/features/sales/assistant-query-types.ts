import type { InvoiceCurrency, InvoiceStatus } from '@prisma/client';

import type { AssistantToolMeta } from '../assistant/tools/types.js';

export type AssistantSalesDocumentListItem = {
  id: string;
  status: InvoiceStatus;
  number: string | null;
  quoteNumber: string | null;
  conduceNumber: string | null;
  currency: InvoiceCurrency;
  fiscal: boolean;
  confirmedAt: string | null;
  quoteIssuedAt: string | null;
  totals: { gross: string; base: string; itbis: string };
  discountPercent: string;
  sellerUserId: string | null;
  sellerName: string | null;
  customerId: string;
  customerName: string;
  appPath: string;
};

export type AssistantSalesDocumentSearchResult = AssistantToolMeta & {
  items: AssistantSalesDocumentListItem[];
};

export type AssistantSalesLine = {
  id: string;
  type: string;
  description: string;
  quantity: string;
  unitPrice: string;
  gross: string | null;
  base: string | null;
  itbis: string | null;
};

export type AssistantSalesPayment = {
  kind: 'PAYMENT' | 'REFUND';
  amount: string;
  method: string;
  effectiveDate: string;
};

export type AssistantSalesDocumentDetail = AssistantToolMeta & {
  id: string;
  status: InvoiceStatus;
  number: string | null;
  quoteNumber: string | null;
  conduceNumber: string | null;
  currency: InvoiceCurrency;
  fiscal: boolean;
  applyItbis: boolean;
  confirmedAt: string | null;
  quoteIssuedAt: string | null;
  quoteExpiresAt: string | null;
  dueDate: string | null;
  sellerUserId: string | null;
  sellerName: string | null;
  customer: { id: string; name: string };
  lines: AssistantSalesLine[];
  payments: AssistantSalesPayment[];
  balance: string | null;
  paymentState: string | null;
  totals: { gross: string; base: string; itbis: string };
  discountPercent: string;
  appPath: string;
};
