export type CorporateSocialNetworks = {
  instagram: string;
  facebook: string;
  tiktok: string;
};

export type CorporateTransferInstructions = {
  bankName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
};

export type CorporatePaymentInstructions = {
  transfer: CorporateTransferInstructions;
  chequePayee: string;
};

export type CorporateProfile = {
  legalName: string;
  rnc: string;
  address: string;
  whatsApp: string;
  email: string;
  /** Short business line used in commercial PDF footers (not social networks). */
  tagline: string;
  social: CorporateSocialNetworks;
  payment: CorporatePaymentInstructions;
};
