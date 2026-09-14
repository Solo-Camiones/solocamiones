import type { Prisma } from '@prisma/client';
import type { HistoryEventInput } from './types.js';
import { historyEventSchema } from './validation.js';

// Requires the caller's transaction; no independent write or mutation API.
export class HistoryRepository {
  constructor(private readonly database: Pick<Prisma.TransactionClient, 'historyEvent'>) {}

  async append(input: HistoryEventInput) {
    const { actor, ...event } = historyEventSchema.parse(input);
    return this.database.historyEvent.create({ data: { ...event, ...actor } });
  }

  listBySubject(subjectType: string, subjectId: string) {
    return this.database.historyEvent.findMany({
      where: { subjectType, subjectId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        occurredAt: true,
        eventType: true,
        payload: true,
        actor: { select: { name: true } },
      },
    });
  }
}
