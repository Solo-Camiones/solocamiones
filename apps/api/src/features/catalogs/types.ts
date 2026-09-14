import type { z } from 'zod';

import type { createCatalogServiceSchema, updateCatalogServiceSchema } from './validation.js';

export type CreateCatalogServiceInput = z.output<typeof createCatalogServiceSchema>;
export type UpdateCatalogServiceInput = z.output<typeof updateCatalogServiceSchema>;

export type CreateCatalogServiceRecord = {
  name: string;
  description?: string | null;
  active?: boolean;
};

export type UpdateCatalogServiceRecord = {
  name?: string;
  description?: string | null;
  active?: boolean;
};

export type PublicCatalogService = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CatalogServiceSnapshot = {
  name: string;
  description: string | null;
  active: boolean;
};
