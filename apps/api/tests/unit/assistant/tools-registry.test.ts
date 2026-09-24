import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AppError } from '../../../src/infrastructure/errors/app-error.js';
import {
  ASSISTANT_FORBIDDEN_OUTPUT_KEYS,
  ASSISTANT_TOOL_NAMES,
  createAssistantToolRegistry,
  createCommercialAssistantTools,
  getProfitabilitySummaryInputSchema,
  searchCustomersInputSchema,
  toolParametersFromSchema,
  type AssistantCommercialQueryPorts,
  type AssistantTool,
} from '../../../src/features/assistant/tools/index.js';

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}

describe('assistant tool schemas', () => {
  it('defaults searchCustomers limit to 20 and rejects oversize limits', () => {
    expect(searchCustomersInputSchema.parse({}).limit).toBe(20);
    expect(() => searchCustomersInputSchema.parse({ limit: 21 })).toThrow();
  });

  it('rejects profitability ranges longer than 366 days', () => {
    expect(() =>
      getProfitabilitySummaryInputSchema.parse({
        dateFrom: '2025-01-01',
        dateTo: '2026-01-02',
        currency: 'DOP',
      }),
    ).toThrow(/366/);
    expect(
      getProfitabilitySummaryInputSchema.parse({
        dateFrom: '2025-01-01',
        dateTo: '2026-01-01',
        currency: 'USD',
      }),
    ).toMatchObject({ currency: 'USD' });
  });

  it('exposes JSON Schema objects for model tool definitions', () => {
    const schema = toolParametersFromSchema(searchCustomersInputSchema);
    expect(schema).toMatchObject({ type: 'object' });
  });
});

describe('assistant tool registry', () => {
  it('registers the six commercial tools exactly once', () => {
    const registry = createAssistantToolRegistry(createCommercialAssistantTools());
    expect(registry.listDefinitions().map((tool) => tool.name).sort()).toEqual(
      [...ASSISTANT_TOOL_NAMES].sort(),
    );
  });

  it('rejects unknown tools and invalid arguments without executing', async () => {
    const execute = vi.fn();
    const tool: AssistantTool = {
      name: 'searchCustomers',
      description: 'test',
      inputSchema: z.strictObject({ query: z.string() }),
      parameters: { type: 'object' },
      execute,
    };
    const registry = createAssistantToolRegistry([tool]);

    await expect(registry.execute('missing', {}, { actorId: 'u1' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(
      registry.execute('searchCustomers', { query: 1 }, { actorId: 'u1' }),
    ).rejects.toBeInstanceOf(AppError);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('commercial assistant tools wiring', () => {
  it('delegates to query ports and never returns forbidden keys', async () => {
    const ports = {
      customers: {
        searchCustomers: vi.fn(async () => ({
          items: [
            {
              id: 'c1',
              name: 'Acme',
              customerType: 'CASH',
              isDefault: false,
              appPath: '/customers',
            },
          ],
          asOf: '2026-09-23T12:00:00.000Z',
          sourceKey: 'tool:searchCustomers',
        })),
        getCommercialSummary: vi.fn(),
      },
      sales: {
        searchDocuments: vi.fn(),
        getDocumentDetail: vi.fn(),
      },
      receivables: { getSummary: vi.fn() },
      profitability: { getSummary: vi.fn() },
    } as unknown as AssistantCommercialQueryPorts;

    const registry = createAssistantToolRegistry(createCommercialAssistantTools(ports));
    const result = await registry.execute(
      'searchCustomers',
      { query: 'Acme' },
      { actorId: 'admin-1' },
    );

    expect(ports.customers.searchCustomers).toHaveBeenCalledWith(
      'admin-1',
      expect.objectContaining({ query: 'Acme', limit: 20 }),
      undefined,
    );
    const keys = collectKeys(result);
    for (const forbidden of ASSISTANT_FORBIDDEN_OUTPUT_KEYS) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});
