import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  captureCommercialSnapshot,
  diffCommercialSnapshots,
  runAssistantEval,
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

  it('runs the complete deterministic evaluation without commercial mutations', async () => {
    const reportPath = resolve(tmpdir(), `assistant-eval-${randomUUID()}.json`);

    try {
      const report = await runAssistantEval({
        mode: 'fake',
        datasetPath: resolve('../../docs/assistant-eval/dataset/v1/cases.json'),
        pricingPath: resolve('../../docs/assistant-eval/pricing.json'),
        reportPath,
      });

      expect(report.environment).toBe('local-fake');
      expect(report.cases).toHaveLength(39);
      expect(report.aggregate.totalCases).toBe(39);
      expect(report.aggregate.mutationHitCount).toBe(0);
      expect(report.hardGates).toEqual({ passed: true, failures: [] });
    } finally {
      await unlink(reportPath).catch(() => undefined);
    }
  }, 30_000);
});
