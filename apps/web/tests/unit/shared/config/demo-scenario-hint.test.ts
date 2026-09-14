// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { DEMO_SCENARIOS, readDemoLoginHint } from '../../../../src/mocks/demo-controls';
import {
  LAST_DEMO_SCENARIO_KEY,
  readLastDemoScenarioHint,
  writeLastDemoScenarioHint,
} from '../../../../src/shared/config/demo-scenario-hint';

afterEach(() => {
  sessionStorage.clear();
});

describe('demo scenario hint storage', () => {
  it('does not persist suggestedPassword in sessionStorage', () => {
    const scenario = DEMO_SCENARIOS[0]!;

    writeLastDemoScenarioHint({
      scenarioId: scenario.id,
      title: scenario.title,
      suggestedUsername: scenario.suggestedUsername,
      nextSteps: scenario.nextSteps,
    });

    const raw = sessionStorage.getItem(LAST_DEMO_SCENARIO_KEY);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('suggestedPassword');
    expect(raw).not.toContain(scenario.suggestedPassword);

    const stored = readLastDemoScenarioHint();
    expect(stored).toEqual({
      scenarioId: scenario.id,
      title: scenario.title,
      suggestedUsername: scenario.suggestedUsername,
      nextSteps: scenario.nextSteps,
    });
    expect(stored).not.toHaveProperty('suggestedPassword');
  });

  it('resolves the login password from in-memory DEMO_SCENARIOS', () => {
    const scenario = DEMO_SCENARIOS[0]!;

    writeLastDemoScenarioHint({
      scenarioId: scenario.id,
      title: scenario.title,
      suggestedUsername: scenario.suggestedUsername,
      nextSteps: scenario.nextSteps,
    });

    expect(readDemoLoginHint()?.suggestedPassword).toBe(scenario.suggestedPassword);
  });

  it('ignores leftover suggestedPassword in old sessionStorage JSON', () => {
    const scenario = DEMO_SCENARIOS[0]!;

    sessionStorage.setItem(
      LAST_DEMO_SCENARIO_KEY,
      JSON.stringify({
        title: scenario.title,
        suggestedUsername: scenario.suggestedUsername,
        suggestedPassword: 'should-not-be-used',
        nextSteps: scenario.nextSteps,
      }),
    );

    expect(readLastDemoScenarioHint()).not.toHaveProperty('suggestedPassword');
    expect(readDemoLoginHint()?.suggestedPassword).toBe(scenario.suggestedPassword);
  });
});
