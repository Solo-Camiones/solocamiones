export type InvoicePdfLineFacts = {
  description: string;
  notes: string | null;
  quantity: string;
  unitPrice: string;
  base: string;
  gross: string;
  itbis: string;
};

export type InvoicePdfFacts = {
  status: 'COMPLETED' | 'CANCELLED';
  number: string;
  currency: 'DOP' | 'USD';
  fiscal: boolean;
  customerName: string;
  customerRnc: string | null;
  customerPhone: string | null;
  sellerName: string | null;
  confirmedAt: Date;
  dueDate: Date;
  paymentState: 'PENDING' | 'OVERDUE' | 'PAID' | 'PAID_LATE' | 'CANCELLED';
  balance: string;
  generatedAt: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  cancelledByName: string | null;
  lines: InvoicePdfLineFacts[];
  totals: { gross: string; base: string; itbis: string };
  templateVersion: string;
};

export type InvoicePdfRenderer = {
  render(facts: InvoicePdfFacts): Promise<Buffer>;
};
