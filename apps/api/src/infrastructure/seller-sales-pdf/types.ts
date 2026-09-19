export type SellerSalesPdfRow = {
  documentTypeLabel: string;
  number: string;
  documentDateLabel: string;
  sellerName: string;
  customerName: string;
  currency: string;
  grossLabel: string;
};

export type SellerSalesPdfTotal = {
  sellerName: string;
  currency: string;
  grossLabel: string;
};

export type SellerSalesPdfFacts = {
  dateFrom: string;
  dateTo: string;
  generatedAt: Date;
  sellerFilterName: string | null;
  rows: SellerSalesPdfRow[];
  totals: SellerSalesPdfTotal[];
};

export type SellerSalesPdfRenderer = {
  render(facts: SellerSalesPdfFacts): Promise<Buffer>;
};
