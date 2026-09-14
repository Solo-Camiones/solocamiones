import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { CustomerRepository } from '../../../src/features/customers/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';

const repository = new CustomerRepository();

async function cleanupCustomers() {
  await prisma.customerContact.deleteMany({ where: { customer: { isDefault: false } } });
  await prisma.customer.deleteMany({ where: { isDefault: false } });
}

describe('CustomerRepository (PostgreSQL)', () => {
  afterEach(cleanupCustomers);
  afterAll(disconnectPrisma);

  it('has Cliente contado with empty contacts after migrate', async () => {
    const generic = await repository.findDefault();
    expect(generic).toMatchObject({
      name: 'Cliente contado',
      rnc: null,
      isDefault: true,
      contacts: [],
    });
    expect(generic?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('creates ordinary customers with contacts and finds them by id', async () => {
    const created = await repository.create({
      name: 'Taller Norte',
      rnc: '131123456',
      address: 'Calle 1',
      notes: 'VIP',
      contacts: [
        {
          name: 'Ana',
          phone: '8091112222',
          email: 'ana@example.com',
          title: 'Compras',
          isPrimary: true,
        },
      ],
    });
    expect(created).toMatchObject({
      name: 'Taller Norte',
      rnc: '131123456',
      isDefault: false,
    });
    expect(created.contacts).toHaveLength(1);
    expect(await repository.findById(created.id)).toEqual(created);
  });

  it('allows duplicate non-fiscal names and rejects a second fiscal identifier', async () => {
    await repository.create({ name: 'Juan' });
    await expect(repository.create({ name: 'Juan' })).resolves.toMatchObject({ name: 'Juan' });
    await repository.create({ name: 'Fiscal A', rnc: '00112345678' });
    await expect(repository.create({ name: 'Fiscal B', rnc: '00112345678' })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('searches by name or RNC and keeps Cliente contado first', async () => {
    await repository.create({ name: 'Taller Norte', rnc: '131123456' });
    await repository.create({ name: 'Otro' });
    const page = await repository.search('norte', 1, 20);
    expect(page.items.map((item) => item.name)).toEqual(['Taller Norte']);
    const byRnc = await repository.search('1-31-12345-6', 1, 20);
    expect(byRnc.items.map((item) => item.name)).toEqual(['Taller Norte']);
    const directory = await repository.search(undefined, 1, 20);
    expect(directory.items[0]?.isDefault).toBe(true);
    expect(directory.total).toBeGreaterThanOrEqual(3);
  });

  it('rolls back a nested contact write when the transaction fails', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await new CustomerRepository(tx).create({
          name: 'Rollback',
          contacts: [{ phone: '8090000000' }],
        });
        throw new Error('forced-failure');
      }),
    ).rejects.toThrow('forced-failure');
    const { items } = await repository.search('Rollback', 1, 20);
    expect(items).toHaveLength(0);
  });

  it('replaces contacts on update', async () => {
    const created = await repository.create({
      name: 'Taller',
      contacts: [{ phone: '8091111111', isPrimary: true }],
    });
    const updated = await repository.update(created.id, {
      name: 'Taller Editado',
      contacts: [{ email: 'ops@example.com', isPrimary: true }],
    });
    expect(updated.name).toBe('Taller Editado');
    expect(updated.contacts).toHaveLength(1);
    expect(updated.contacts[0]?.email).toBe('ops@example.com');
    expect(updated.contacts[0]?.id).not.toBe(created.contacts[0]?.id);
  });

  it('does not create a customer when updating an unknown identity', async () => {
    await expect(repository.update(randomUUID(), { name: 'Missing' })).rejects.toMatchObject({
      code: 'P2025',
    });
  });
});
