import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deployShPassesCfAccessServiceTokenToSmoke,
  deployShReadsSmokeBaseUrlFromEnvFile,
  deployShUsesHostShellSmoke,
} from './assert-deploy-smoke-host-runtime.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEPLOY_SH = resolve(SCRIPT_DIR, 'deploy.sh');

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
    const text =
      'node "${ROOT_DIR}/scripts/deployment/smoke-staging.mjs" --base-url "${SMOKE_BASE_URL}"';
    assert.equal(deployShUsesHostShellSmoke(text), false);
  });

  it('passes against current deploy.sh', () => {
    const deployText = readFileSync(DEPLOY_SH, 'utf8');
    assert.equal(deployShUsesHostShellSmoke(deployText), true);
  });
});

describe('deployShReadsSmokeBaseUrlFromEnvFile', () => {
  it('requires env_file_get of SMOKE_BASE_URL plus canonical default', () => {
    const text = [
      'SMOKE_BASE_URL="$(env_file_get "${ENV_FILE}" "SMOKE_BASE_URL")"',
      'SMOKE_BASE_URL="${SMOKE_BASE_URL:-https://staging.solocamiones.com}"',
    ].join('\n');
    assert.equal(deployShReadsSmokeBaseUrlFromEnvFile(text), true);
  });

  it('rejects default-only smoke URL wiring', () => {
    const text = 'SMOKE_BASE_URL="${SMOKE_BASE_URL:-https://staging.solocamiones.com}"';
    assert.equal(deployShReadsSmokeBaseUrlFromEnvFile(text), false);
  });

  it('passes against current deploy.sh', () => {
    const deployText = readFileSync(DEPLOY_SH, 'utf8');
    assert.equal(deployShReadsSmokeBaseUrlFromEnvFile(deployText), true);
  });
});

describe('deployShPassesCfAccessServiceTokenToSmoke', () => {
  it('requires env_file_get and CLI flags for Access service token', () => {
    const text = [
      'CF_ACCESS_CLIENT_ID="$(env_file_get "${ENV_FILE}" "CF_ACCESS_CLIENT_ID")"',
      'CF_ACCESS_CLIENT_SECRET="$(env_file_get "${ENV_FILE}" "CF_ACCESS_CLIENT_SECRET")"',
      'smoke_args+=(--cf-access-client-id "${CF_ACCESS_CLIENT_ID}")',
      'smoke_args+=(--cf-access-client-secret "${CF_ACCESS_CLIENT_SECRET}")',
    ].join('\n');
    assert.equal(deployShPassesCfAccessServiceTokenToSmoke(text), true);
  });

  it('rejects smoke without Access service token wiring', () => {
    const text =
      'bash "${ROOT_DIR}/scripts/deployment/smoke-staging.sh" --base-url "${SMOKE_BASE_URL}"';
    assert.equal(deployShPassesCfAccessServiceTokenToSmoke(text), false);
  });

  it('passes against current deploy.sh', () => {
    const deployText = readFileSync(DEPLOY_SH, 'utf8');
    assert.equal(deployShPassesCfAccessServiceTokenToSmoke(deployText), true);
  });
});
