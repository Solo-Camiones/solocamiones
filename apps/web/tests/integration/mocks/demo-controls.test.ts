import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEMO_SCENARIOS, resetDemoData, runDemoScenario } from '../../../src/mocks/demo-controls';
import { getSession, setSession } from '../../../src/mocks/session';
import { getMockState, resetMockState } from '../../../src/mocks/state';
import { confirmInvoice, setDraftLinePrice } from '../../../src/mocks/services/sales-pos-commands';

describe('demo controls', () => {
  beforeEach(() => {
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('keeps the documented scenario catalog complete and unambiguous', () => {
    expect(DEMO_SCENARIOS).toHaveLength(12);
    expect(new Set(DEMO_SCENARIOS.map((scenario) => scenario.id)).size).toBe(12);
    expect(new Set(DEMO_SCENARIOS.map((scenario) => scenario.slug)).size).toBe(12);
  });

  it('restores seed state and clears the active session', () => {
    getMockState().customers.push({
      id: 'C99',
      name: 'Cliente temporal',
      customerType: 'CASH',
      contacts: [],
    });
    setSession({ userId: 'U-ADMIN', createdAt: '2026-08-28T16:00:00.000Z' });

    const result = resetDemoData();

    expect(result.ok).toBe(true);
    expect(getMockState().customers).toHaveLength(3);
    expect(getSession()).toBeNull();
  });

  it('rejects unknown scenarios without resetting current state', () => {
    getMockState().customers.push({
      id: 'C99',
      name: 'Cliente temporal',
      customerType: 'CASH',
      contacts: [],
    });

    const result = runDemoScenario(999);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(getMockState().customers).toHaveLength(4);
  });

  it('runs all 12 scenarios without error after a seed reset', () => {
    for (const scenario of DEMO_SCENARIOS) {
      const result = runDemoScenario(scenario.id);
      if (!result.ok) {
        throw new Error(`${scenario.slug}: ${result.error.message}`);
      }
      expect(getSession()).toBeNull();
    }
  });

  it('prepares scenario 5 as a clean, confirmable full-assembly sale', () => {
    const result = runDemoScenario(5);
    expect(result.ok).toBe(true);

    const state = getMockState();
    const draft = state.invoices.find((invoice) => invoice.status === 'DRAFT')!;
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]?.itemId).toBe('MOT-003');

    const seller = state.users.find((user) => user.id === 'U-LAURA')!;
    const priced = setDraftLinePrice(state, seller, {
      draftId: draft.id,
      lineId: draft.lines[0]!.id,
      unitPrice: 350_000,
    });
    expect(priced.ok).toBe(true);

    const confirmed = confirmInvoice(state, seller, draft.id);
    expect(confirmed.ok).toBe(true);
    expect(state.items.find((item) => item.id === 'MOT-003')?.commercialState).toBe('SOLD');
    expect(state.items.find((item) => item.id === 'ALT-011')?.commercialState).toBe('SOLD');
  });
});
