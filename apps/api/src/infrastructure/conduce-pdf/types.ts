export type ConducePdfLineFacts = {
  description: string;
  notes: string | null;
  quantity: string;
  unitPrice: string;
  base: string;
  gross: string;
  itbis: string;
};

export type ConducePdfFacts = {
  status: 'CONDUCE' | 'CANCELLED';
  conduceNumber: string;
  originQuoteNumber: string | null;
  currency: 'DOP' | 'USD';
  customerName: string;
  customerRnc: string | null;
  customerPhone: string | null;
  sellerName: string | null;
  conduceIssuedAt: Date;
  dueDate: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  cancelledByName: string | null;
  lines: ConducePdfLineFacts[];
  totals: {
    gross: string;
    base: string;
    itbis: string;
    discount: string;
    discountPercent: string;
  };
};

export type ConducePdfRenderer = {
  render(facts: ConducePdfFacts): Promise<Buffer>;
};
