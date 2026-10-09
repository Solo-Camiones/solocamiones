import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeTextUsesNpmCommand } from './assert-api-runtime-no-npm-commands.mjs';

describe('composeTextUsesNpmCommand', () => {
  it('detects inline array form', () => {
    assert.equal(composeTextUsesNpmCommand(`command: ['npm', 'run', 'migrate']`), true);
    assert.equal(composeTextUsesNpmCommand(`command: ["npm", "run", "migrate"]`), true);
  });

  it('detects block list form with npm', () => {
    const text = ['command:', '  - npm', '  - run', '  - migrate'].join('\n');
    assert.equal(composeTextUsesNpmCommand(text), true);
  });

  it('allows non-npm commands', () => {
    assert.equal(composeTextUsesNpmCommand(`command: ['node', '--run', 'db:migrate']`), false);
    const block = ['command:', '  - node', '  - --run', '  - db:migrate'].join('\n');
    assert.equal(composeTextUsesNpmCommand(block), false);
  });

  it('finishes quickly on former ReDoS input', () => {
    const attack = 'command:\n\t-' + '\t\t\n\t-'.repeat(40);
    const startedAt = process.hrtime.bigint();
    const usesNpm = composeTextUsesNpmCommand(attack);
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    assert.equal(usesNpm, false);
    assert.ok(elapsedMs < 50, `expected <50ms, got ${elapsedMs.toFixed(2)}ms`);
  });
});
