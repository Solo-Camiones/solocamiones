import type { CustomerType } from '@prisma/client';

import type { AssistantToolMeta } from '../assistant/tools/types.js';

export type AssistantCustomerSearchItem = {
  id: string;
  name: string;
  customerType: CustomerType;
  isDefault: boolean;
  appPath: string;
};

export type AssistantCustomerSearchResult = AssistantToolMeta & {
  items: AssistantCustomerSearchItem[];
};

export type AssistantCustomerCommercialSummary = AssistantToolMeta & {
  id: string;
  name: string;
  customerType: CustomerType;
  isDefault: boolean;
  creditLimitDop: string | null;
  creditTermDays: number | null;
  openBalanceDop: string;
  openBalanceUsd: string;
  openDocumentCount: number;
  /** Present only for CREDIT customers. */
  creditExposureUsedDop?: string;
  creditRemainingDop?: string | null;
  appPath: string;
};
