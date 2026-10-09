import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployShUsesHostShellSmoke } from './assert-deploy-smoke-host-runtime.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

describe('deployShUsesHostShellSmoke', () => {
  it('accepts shell smoke invocation', () => {
    const text = [
      'if [[ "${APP_ENV}" == "staging" ]]; then',
      '  bash "${ROOT_DIR}/scripts/deployment/smoke-staging.sh" --base-url "${SMOKE_BASE_URL}"',
      'fi',
    ].join('\n');
    assert.equal(deployShUsesHostShellSmoke(text), true);
  });

  it('rejects Node smoke invocation', () => {
    const text = 'node "${ROOT_DIR}/scripts/deployment/smoke-staging.mjs" --base-url "${SMOKE_BASE_URL}"';
    assert.equal(deployShUsesHostShellSmoke(text), false);
  });

  it('passes against current deploy.sh', () => {
    const deployText = readFileSync(resolve(SCRIPT_DIR, 'deploy.sh'), 'utf8');
    assert.equal(deployShUsesHostShellSmoke(deployText), true);
  });
});
