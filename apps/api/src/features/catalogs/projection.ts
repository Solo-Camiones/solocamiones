import type { MechanicalService } from '@prisma/client';

import type { CatalogServiceSnapshot, PublicCatalogService } from './types.js';

export function toPublicCatalogService(service: MechanicalService): PublicCatalogService {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    active: service.active,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  };
}

export function toCatalogServiceSnapshot(service: MechanicalService): CatalogServiceSnapshot {
  return {
    name: service.name,
    description: service.description,
    active: service.active,
  };
}
