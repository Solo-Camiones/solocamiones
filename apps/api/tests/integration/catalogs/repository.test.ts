import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { CatalogRepository } from '../../../src/features/catalogs/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';

const repository = new CatalogRepository();

describe('CatalogRepository (PostgreSQL)', () => {
  afterEach(async () => {
    await prisma.invoice.deleteMany();
    await prisma.mechanicalService.deleteMany();
  });
  afterAll(disconnectPrisma);

  it('persists active and inactive services and omits inactive from the selection list', async () => {
    const active = await repository.create({
      name: 'Instalación mecánica',
      description: 'Montaje en bahía',
    });
    const inactive = await repository.create({
      name: 'Diagnóstico electrónico',
      active: false,
    });
    expect(active).toMatchObject({
      name: 'Instalación mecánica',
      description: 'Montaje en bahía',
      active: true,
    });
    expect(inactive.active).toBe(false);
    expect((await repository.listActive()).map((item) => item.name)).toEqual([
      'Instalación mecánica',
    ]);
    expect((await repository.listAll()).map((item) => item.name)).toEqual([
      'Diagnóstico electrónico',
      'Instalación mecánica',
    ]);
  });

  it('updates name, description and active flag', async () => {
    const created = await repository.create({ name: 'Desarme' });
    const updated = await repository.update(created.id, {
      name: 'Desarme especializado',
      description: 'Solo conjuntos',
      active: false,
    });
    expect(updated).toMatchObject({
      id: created.id,
      name: 'Desarme especializado',
      description: 'Solo conjuntos',
      active: false,
    });
    expect(await repository.listActive()).toEqual([]);
    expect(await repository.findById(created.id)).toEqual(updated);
  });
});
