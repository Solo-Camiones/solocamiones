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
  originQuoteNumber: string | null;
  currency: 'DOP' | 'USD';
  fiscal: boolean;
  customerName: string;
  customerRnc: string | null;
  customerPhone: string | null;
  sellerName: string | null;
  confirmedAt: Date;
  dueDate: Date;
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
