import type { MechanicalService, Prisma } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import type { CreateCatalogServiceRecord, UpdateCatalogServiceRecord } from './types.js';

type CatalogDatabase = Pick<Prisma.TransactionClient, 'mechanicalService'>;

export class CatalogRepository {
  constructor(private readonly database: CatalogDatabase = prisma) {}

  create(input: CreateCatalogServiceRecord): Promise<MechanicalService> {
    return this.database.mechanicalService.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        active: input.active ?? true,
      },
    });
  }

  findById(id: string): Promise<MechanicalService | null> {
    return this.database.mechanicalService.findUnique({ where: { id } });
  }

  update(id: string, input: UpdateCatalogServiceRecord): Promise<MechanicalService> {
    return this.database.mechanicalService.update({
      where: { id },
      data: {
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
  }

  listAll(): Promise<MechanicalService[]> {
    return this.database.mechanicalService.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  listActive(): Promise<MechanicalService[]> {
    return this.database.mechanicalService.findMany({
      where: { active: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }
}
