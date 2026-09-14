import { AppError } from '../../infrastructure/errors/app-error.js';
import { assertCatalogAdministrator, assertCatalogReader } from './policies.js';
import { toCatalogServiceSnapshot, toPublicCatalogService } from './projection.js';
import { catalogTransaction, type CatalogTransaction } from './transaction.js';
import {
  catalogServiceIdSchema,
  createCatalogServiceSchema,
  updateCatalogServiceSchema,
} from './validation.js';

export class CatalogService {
  constructor(private readonly transaction: CatalogTransaction = catalogTransaction) {}

  async create(actorId: string, input: unknown) {
    const profile = createCatalogServiceSchema.parse(input);
    return this.transaction(async ({ catalogs, users, history }) => {
      assertCatalogAdministrator(await users.findById(actorId));
      const service = await catalogs.create({
        name: profile.name,
        description: profile.description ?? null,
        active: profile.active,
      });
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'MECHANICAL_SERVICE',
        subjectId: service.id,
        eventType: 'SERVICE_CREATED',
        payload: toCatalogServiceSnapshot(service),
      });
      return toPublicCatalogService(service);
    });
  }

  async list(actorId: string) {
    return this.transaction(async ({ catalogs, users }) => {
      const actor = await users.findById(actorId);
      assertCatalogReader(actor);
      const items =
        actor!.role === 'ADMINISTRATOR' ? await catalogs.listAll() : await catalogs.listActive();
      return { items: items.map(toPublicCatalogService) };
    });
  }

  async getById(actorId: string, id: string) {
    catalogServiceIdSchema.parse({ id });
    return this.transaction(async ({ catalogs, users }) => {
      const actor = await users.findById(actorId);
      assertCatalogReader(actor);
      const service = await catalogs.findById(id);
      if (!service || (actor!.role !== 'ADMINISTRATOR' && !service.active)) {
        throw AppError.notFound('Service not found');
      }
      return toPublicCatalogService(service);
    });
  }

  async update(actorId: string, id: string, input: unknown) {
    catalogServiceIdSchema.parse({ id });
    const patch = updateCatalogServiceSchema.parse(input);
    return this.transaction(async ({ catalogs, users, history }) => {
      assertCatalogAdministrator(await users.findById(actorId));
      const existing = await catalogs.findById(id);
      if (!existing) throw AppError.notFound('Service not found');
      const updated = await catalogs.update(id, {
        name: patch.name,
        description: patch.description,
        active: patch.active,
      });
      await history.append({
        actor: { actorType: 'USER', actorUserId: actorId },
        subjectType: 'MECHANICAL_SERVICE',
        subjectId: id,
        eventType: 'SERVICE_UPDATED',
        payload: {
          before: toCatalogServiceSnapshot(existing),
          after: toCatalogServiceSnapshot(updated),
        },
      });
      return toPublicCatalogService(updated);
    });
  }
}

export const catalogService = new CatalogService();
