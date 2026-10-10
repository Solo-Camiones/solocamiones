#!/usr/bin/env node
/**
 * Guard: staging smoke must run with host curl/jq (smoke-staging.sh), not Node.
 * The VPS bootstrap does not install Node.js.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEPLOY_SH = resolve(SCRIPT_DIR, 'deploy.sh');

export function deployShUsesHostShellSmoke(deployText) {
  const invokesShellSmoke = /smoke-staging\.sh/.test(deployText);
  const invokesNodeSmoke =
    /\bnode\b[\s\S]{0,120}smoke-staging\.mjs/.test(deployText) ||
    /smoke-staging\.mjs/.test(deployText);
  return invokesShellSmoke && !invokesNodeSmoke;
}

/** Smoke URL must resolve from process env → ENV_FILE → canonical default (not Compose injection alone). */
export function deployShReadsSmokeBaseUrlFromEnvFile(deployText) {
  const readsFromEnvFile = /env_file_get\s+"\$\{ENV_FILE\}"\s+"SMOKE_BASE_URL"/.test(deployText);
  const hasDefault =
    /SMOKE_BASE_URL="\$\{SMOKE_BASE_URL:-https:\/\/staging\.solocamiones\.com\}"/.test(deployText);
  return readsFromEnvFile && hasDefault;
}

function main() {
  const deployText = readFileSync(DEPLOY_SH, 'utf8');
  if (!deployShUsesHostShellSmoke(deployText)) {
    console.error(
      'assert-deploy-smoke-host-runtime: deploy.sh must invoke smoke-staging.sh and must not call Node for smoke',
    );
    process.exit(1);
  }
  if (!deployShReadsSmokeBaseUrlFromEnvFile(deployText)) {
    console.error(
      'assert-deploy-smoke-host-runtime: deploy.sh must resolve SMOKE_BASE_URL from ENV_FILE before the canonical default',
    );
    process.exit(1);
  }
  console.log('assert-deploy-smoke-host-runtime: OK');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
