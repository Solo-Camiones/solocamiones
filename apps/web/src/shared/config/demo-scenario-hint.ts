export const LAST_DEMO_SCENARIO_KEY = 'solocamiones.demo.lastScenario';

/** Persisted demo walkthrough hint. Never includes a password. */
export type StoredDemoScenarioHint = {
  scenarioId?: number;
  title: string;
  suggestedUsername: string;
  nextSteps: string;
};

type WriteDemoScenarioHint = {
  scenarioId: number;
  title: string;
  suggestedUsername: string;
  nextSteps: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function readLastDemoScenarioHint(): StoredDemoScenarioHint | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  const raw = sessionStorage.getItem(LAST_DEMO_SCENARIO_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!isNonEmptyString(parsed.title) || !isNonEmptyString(parsed.suggestedUsername)) {
      return null;
    }

    // Ignore leftover suggestedPassword from older persisted JSON; never re-write it.
    return {
      ...(typeof parsed.scenarioId === 'number' ? { scenarioId: parsed.scenarioId } : {}),
      title: parsed.title,
      suggestedUsername: parsed.suggestedUsername,
      nextSteps: typeof parsed.nextSteps === 'string' ? parsed.nextSteps : '',
    };
  } catch {
    return null;
  }
}

export function writeLastDemoScenarioHint(hint: WriteDemoScenarioHint): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  const payload: WriteDemoScenarioHint = {
    scenarioId: hint.scenarioId,
    title: hint.title,
    suggestedUsername: hint.suggestedUsername,
    nextSteps: hint.nextSteps,
  };

  sessionStorage.setItem(LAST_DEMO_SCENARIO_KEY, JSON.stringify(payload));
}

export function clearLastDemoScenarioHint(): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  sessionStorage.removeItem(LAST_DEMO_SCENARIO_KEY);
}
