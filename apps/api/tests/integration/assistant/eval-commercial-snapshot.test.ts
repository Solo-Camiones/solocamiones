import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import {
  captureCommercialSnapshot,
  diffCommercialSnapshots,
} from '../../../src/features/assistant/eval/index.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';

describe('Assistant eval commercial snapshot (PostgreSQL)', () => {
  afterAll(disconnectPrisma);

  it('detects an in-place commercial update with no row-count change', async () => {
    const service = await prisma.mechanicalService.create({
      data: {
        name: `Eval snapshot ${randomUUID()}`,
        description: 'before',
      },
    });

    try {
      const before = await captureCommercialSnapshot();
      await prisma.mechanicalService.update({
        where: { id: service.id },
        data: { description: 'after' },
      });
      const after = await captureCommercialSnapshot();

      expect(after.MechanicalService.rowCount).toBe(before.MechanicalService.rowCount);
      expect(diffCommercialSnapshots(before, after)).toEqual(['MechanicalService']);
    } finally {
      await prisma.mechanicalService.delete({ where: { id: service.id } });
    }
  });
});
