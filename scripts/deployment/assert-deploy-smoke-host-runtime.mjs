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

function main() {
  const deployText = readFileSync(DEPLOY_SH, 'utf8');
  if (!deployShUsesHostShellSmoke(deployText)) {
    console.error(
      'assert-deploy-smoke-host-runtime: deploy.sh must invoke smoke-staging.sh and must not call Node for smoke',
    );
    process.exit(1);
  }
  console.log('assert-deploy-smoke-host-runtime: OK');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
