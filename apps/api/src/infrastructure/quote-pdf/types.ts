export type QuotePdfLineFacts = {
  description: string;
  notes: string | null;
  quantity: string;
  unitPrice: string;
  base: string;
  gross: string;
  itbis: string;
};

export type QuotePdfFacts = {
  status: 'QUOTE_ISSUED';
  quoteNumber: string;
  currency: 'DOP' | 'USD';
  customerName: string;
  customerRnc: string | null;
  customerPhone: string | null;
  sellerName: string | null;
  quoteIssuedAt: Date;
  quoteExpiresAt: Date;
  lines: QuotePdfLineFacts[];
  totals: { gross: string; base: string; itbis: string };
};

export type QuotePdfRenderer = {
  render(facts: QuotePdfFacts): Promise<Buffer>;
};
