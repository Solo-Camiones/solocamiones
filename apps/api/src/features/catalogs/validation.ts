import { z } from 'zod';

export const catalogServiceNameSchema = z.string().trim().min(1, 'Name is required');
export const catalogServiceDescriptionSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  return value.trim() || null;
}, z.string().min(1).nullable().optional());

export const createCatalogServiceSchema = z.strictObject({
  name: catalogServiceNameSchema,
  description: catalogServiceDescriptionSchema,
  active: z.boolean().optional(),
});

export const updateCatalogServiceSchema = createCatalogServiceSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const catalogServiceIdSchema = z.strictObject({ id: z.uuid() });
