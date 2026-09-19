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
  /** From confirmation settlement: full initial payment = CASH, otherwise CREDIT. */
  saleCondition: 'CASH' | 'CREDIT';
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
  totals: {
    gross: string;
    base: string;
    itbis: string;
    discount: string;
    discountPercent: string;
  };
  templateVersion: string;
};

export type InvoicePdfRenderer = {
  render(facts: InvoicePdfFacts): Promise<Buffer>;
};
