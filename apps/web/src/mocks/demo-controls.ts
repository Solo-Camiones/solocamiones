import { err, ok, type Result } from '../shared/auth/types';
import { getAppCapabilities } from '../shared/config/capabilities';
import {
  readLastDemoScenarioHint,
  writeLastDemoScenarioHint,
  type StoredDemoScenarioHint,
} from '../shared/config/demo-scenario-hint';
import { applyDemoScenario, DEMO_SCENARIOS, type DemoScenario } from './scenarios';
import { clearSession } from './session';
import { getMockState, resetMockState } from './state';

export type { DemoScenario } from './scenarios';
export { DEMO_SCENARIOS } from './scenarios';

const DEV_ONLY_MESSAGE = 'Los controles demo solo están disponibles cuando prototypeControls está habilitado.';

function isDemoControlsEnabled(): boolean {
  return getAppCapabilities().prototypeControls;
}

/** Restores seed data and clears the mock session. Does not bypass login. */
export function resetDemoData(): Result<void> {
  if (!isDemoControlsEnabled()) {
    return err({ code: 'FORBIDDEN', message: DEV_ONLY_MESSAGE });
  }

  resetMockState();
  clearSession();
  return ok(undefined);
}

/** Resets seed, verifies the walkthrough starting point, and records login hints. */
export function runDemoScenario(scenarioId: number): Result<DemoScenario> {
  if (!isDemoControlsEnabled()) {
    return err({ code: 'FORBIDDEN', message: DEV_ONLY_MESSAGE });
  }

  const scenario = DEMO_SCENARIOS.find((entry) => entry.id === scenarioId);

  if (!scenario) {
    return err({ code: 'NOT_FOUND', message: 'Escenario demo no encontrado' });
  }

  const resetResult = resetDemoData();
  if (!resetResult.ok) {
    return resetResult;
  }

  const applied = applyDemoScenario(getMockState(), scenario.id);
  if (!applied.ok) {
    return applied;
  }

  writeLastDemoScenarioHint({
    scenarioId: scenario.id,
    title: scenario.title,
    suggestedUsername: scenario.suggestedUsername,
    nextSteps: scenario.nextSteps,
  });

  return ok(scenario);
}

/** Resolves the in-memory demo password; never reads a password from storage. */
export function findDemoScenarioForHint(hint: StoredDemoScenarioHint): DemoScenario | undefined {
  return (
    (hint.scenarioId !== undefined
      ? DEMO_SCENARIOS.find((entry) => entry.id === hint.scenarioId)
      : undefined) ??
    DEMO_SCENARIOS.find(
      (entry) =>
        entry.suggestedUsername === hint.suggestedUsername && entry.title === hint.title,
    ) ??
    DEMO_SCENARIOS.find((entry) => entry.suggestedUsername === hint.suggestedUsername)
  );
}

/** Login aside payload: stored hint plus password from DEMO_SCENARIOS. */
export function readDemoLoginHint(): (StoredDemoScenarioHint & { suggestedPassword: string }) | null {
  const stored = readLastDemoScenarioHint();
  if (!stored) {
    return null;
  }

  const scenario = findDemoScenarioForHint(stored);
  if (!scenario) {
    return null;
  }

  return {
    ...stored,
    suggestedPassword: scenario.suggestedPassword,
  };
}
