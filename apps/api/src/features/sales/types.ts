import type {
  CostProvenance,
  Customer,
  Invoice,
  InvoiceCurrency,
  InvoiceLine,
  InvoiceLineType,
  InvoicePayment,
  InvoiceSequence,
  InvoiceStatus,
  Prisma,
  Role,
  User,
} from '@prisma/client';

import type { InvoiceHistoryEntryView } from '../history/invoice-timeline.js';

export type InvoicePaymentRecord = InvoicePayment & { actor: User };
export type InvoiceRecord = Invoice & {
  lines: InvoiceLine[];
  customer: Customer;
  payments: InvoicePaymentRecord[];
};

export type InvoiceListRecord = Invoice & {
  customer: Customer;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
};

export type InvoiceViewer = { role: Role };

export type CreateDraftInvoiceRecord = {
  customerId: string;
  currency: InvoiceCurrency;
  fiscal: boolean;
};

export type UpdateDraftInvoiceRecord = {
  customerId?: string;
  currency?: InvoiceCurrency;
  fiscal?: boolean;
};

export type ListInvoicesQuery = {
  status?: InvoiceStatus;
  q?: string;
  page: number;
  pageSize: number;
};

export type ListReceivablesQuery = {
  customerId?: string;
  currency?: InvoiceCurrency;
  paymentState?: 'PENDING' | 'OVERDUE';
  page: number;
  pageSize: number;
  today: Date;
};

export type ReceivablesCustomerAggregate = {
  customerId: string;
  customerName: string;
  currency: InvoiceCurrency;
  invoiceCount: number;
  invoiced: Prisma.Decimal;
  paid: Prisma.Decimal;
  balance: Prisma.Decimal;
};

export type PublicCustomerOutstanding = {
  customerId: string;
  customerName: string;
  currency: InvoiceCurrency;
  invoiceCount: number;
  invoiced: string;
  paid: string;
  balance: string;
};

export type PublicReceivableInvoice = PublicInvoiceListItem & { paid: string };

export type PublicReceivables = {
  invoices: PublicReceivableInvoice[];
  customers: PublicCustomerOutstanding[];
  total: number;
  page: number;
  pageSize: number;
};

export type CreateInvoiceLineRecord = {
  invoiceId: string;
  type: InvoiceLineType;
  description: string;
  notes?: string | null;
  quantity?: Prisma.Decimal | string;
  unitPrice: Prisma.Decimal | string;
  acquisitionCostDop?: Prisma.Decimal | string | null;
  costProvenance?: CostProvenance | null;
  serviceId?: string | null;
};

export type UpdateInvoiceLineRecord = {
  invoiceId: string;
  lineId: string;
  unitPrice?: Prisma.Decimal | string;
  quantity?: Prisma.Decimal | string;
  description?: string;
  notes?: string | null;
  acquisitionCostDop?: Prisma.Decimal | string | null;
  costProvenance?: CostProvenance | null;
};

export type CompleteInvoiceLineMoneyRecord = {
  id: string;
  gross: Prisma.Decimal | string;
  base: Prisma.Decimal | string;
  itbis: Prisma.Decimal | string;
};

export type CompleteInvoiceRecord = {
  id: string;
  number: string;
  confirmedAt: Date;
  dueDate: Date;
  customerName: string;
  customerRnc: string | null;
  customerPhone: string | null;
  confirmedByUserId: string | null;
  confirmedByName: string | null;
  gross: Prisma.Decimal | string;
  base: Prisma.Decimal | string;
  itbis: Prisma.Decimal | string;
  lines: CompleteInvoiceLineMoneyRecord[];
};

export type InvoiceSequenceRecord = InvoiceSequence;

export type InvoiceCustomerView = {
  id: string;
  name: string;
  rnc: string | null;
  isDefault: boolean;
};

export type InvoiceCustomerSnapshot = {
  name: string;
  rnc: string | null;
  phone: string | null;
};

export type PublicPaymentState = 'PENDING' | 'OVERDUE' | 'PAID' | 'PAID_LATE' | 'CANCELLED';

export type PublicInvoicePayment = {
  id: string;
  kind: InvoicePayment['kind'];
  amount: string;
  method: InvoicePayment['method'];
  effectiveDate: string;
  recordedAt: string;
  reference: string | null;
  actorName: string;
};

export type RecordUsdFxRateRecord = {
  id: string;
  exchangeRateDopPerUsd: Prisma.Decimal | string;
  source: string;
  rateUpdatedAt: Date;
  obtainedAt: Date;
};

export type PublicFxProvenance = {
  exchangeRateDopPerUsd: string;
  source: string;
  rateUpdatedAt: string;
  obtainedAt: string;
};

export type PublicProfitability = {
  status: 'CALCULATED' | 'UNAVAILABLE' | 'MANUAL';
  reason: 'UNKNOWN_COST' | 'PENDING_FX_RATE' | null;
  profitDop: string | null;
  margin: string | null;
  fx?: PublicFxProvenance;
};

export type RecordManualGrossProfitRecord = {
  id: string;
  profitDop: Prisma.Decimal | string;
  recordedAt: Date;
};

export type PublicInvoiceLine = {
  id: string;
  type: InvoiceLineType;
  description: string;
  notes: string | null;
  quantity: string;
  unitPrice: string;
  taxable: boolean;
  gross: string;
  base: string;
  itbis: string;
  acquisitionCostDop: string | null;
  costProvenance: CostProvenance | null;
  serviceId: string | null;
  profitability?: PublicProfitability;
};

export type PublicInvoiceDocument = { status: 'READY' } | { status: 'FAILED'; errorId: string };

export type PublicInvoiceHistoryEntry = InvoiceHistoryEntryView;

export type RecordInvoicePdfStatusRecord = {
  id: string;
  status: 'READY' | 'FAILED';
  errorId: string | null;
  generatedAt: Date;
  templateVersion: string;
  currentPdfStatus: 'FAILED' | null;
};

export type InvoicePdfHistorySnapshot = {
  status: 'READY' | 'FAILED';
  errorId: string | null;
  templateVersion: string;
};

export type PublicInvoice = {
  id: string;
  status: InvoiceStatus;
  number: string | null;
  currency: InvoiceCurrency;
  fiscal: boolean;
  customer: InvoiceCustomerView;
  customerSnapshot: InvoiceCustomerSnapshot | null;
  confirmedAt: string | null;
  dueDate: string | null;
  sellerName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledByName: string | null;
  paymentState: PublicPaymentState;
  payments: PublicInvoicePayment[];
  paid: string;
  refunded: string;
  balance: string;
  lines: PublicInvoiceLine[];
  totals: { gross: string; base: string; itbis: string };
  profitability?: PublicProfitability;
  document?: PublicInvoiceDocument;
  history: PublicInvoiceHistoryEntry[];
  createdAt: string;
  updatedAt: string;
};

export type PublicInvoiceListPayment = {
  kind: InvoicePayment['kind'];
  amount: string;
  method: InvoicePayment['method'];
  effectiveDate: string;
};

export type PublicInvoiceListItem = {
  id: string;
  status: InvoiceStatus;
  number: string | null;
  currency: InvoiceCurrency;
  fiscal: boolean;
  customer: InvoiceCustomerView;
  customerSnapshot: InvoiceCustomerSnapshot | null;
  confirmedAt: string | null;
  dueDate: string | null;
  paymentState: PublicPaymentState;
  payments: PublicInvoiceListPayment[];
  balance: string;
  totals: { gross: string; base: string; itbis: string };
  profitability?: PublicProfitability;
  /** Stored profitability FX rate. Administrator-only; used to report USD receipts in DOP. */
  exchangeRateDopPerUsd?: string;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceDraftHistorySnapshot = {
  status: 'DRAFT';
  number: null;
  currency: InvoiceCurrency;
  fiscal: boolean;
  customerId: string;
};

export type InvoiceConfirmedHistorySnapshot = {
  status: 'COMPLETED';
  number: string;
  currency: InvoiceCurrency;
  fiscal: boolean;
  customerId: string;
  customerSnapshot: InvoiceCustomerSnapshot;
  totals: { gross: string; base: string; itbis: string };
  confirmedAt: string;
  dueDate: string;
  confirmedByUserId: string;
  confirmedByName: string;
};

export type PaymentRecordedHistorySnapshot = {
  paymentId: string;
  amount: string;
  currency: InvoiceCurrency;
  method: InvoicePayment['method'];
  effectiveDate: string;
  reference: string | null;
};

export type InvoiceCancelledHistorySnapshot = {
  reason: string;
  cancelledAt: string;
  cancelledByName: string;
  refundId: string | null;
  refundAmount: string;
  refundMethod: InvoicePayment['method'] | null;
};

export type InvoiceUsdFxRetryHistorySnapshot = {
  outcome: 'RECORDED' | 'UNAVAILABLE';
  reason: string | null;
  asOf: string;
  after: PublicFxProvenance | null;
};

export type InvoiceUsdFxRecordedHistorySnapshot = {
  asOf: string;
  after: PublicFxProvenance;
};

export type InvoiceLineHistorySnapshot = {
  id: string;
  type: InvoiceLineType;
  description: string;
  notes: string | null;
  quantity: string;
  unitPrice: string;
  acquisitionCostDop: string | null;
  costProvenance: CostProvenance | null;
  serviceId: string | null;
};
