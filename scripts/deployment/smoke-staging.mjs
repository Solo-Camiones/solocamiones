#!/usr/bin/env node
/**
 * Minimal staging smoke after digest deploy (M5.4).
 *
 * Scope is intentionally narrow: reachability + liveness/readiness.
 * Commercial §16 coverage belongs to M7.3 once staging has synthetic data.
 *
 * Usage:
 *   node scripts/deployment/smoke-staging.mjs --base-url https://staging.solocamiones.com
 *
 * Optional:
 *   --cf-access-client-id
 *   --cf-access-client-secret
 *   (or env CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET for Access service tokens)
 */
const DEFAULT_TIMEOUT_MS = 15_000;

function printUsage() {
  console.log(`Usage: smoke-staging.mjs --base-url <url> [--cf-access-client-id <id>] [--cf-access-client-secret <secret>]`);
}

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.SMOKE_BASE_URL ?? '',
    cfAccessClientId: process.env.CF_ACCESS_CLIENT_ID ?? '',
    cfAccessClientSecret: process.env.CF_ACCESS_CLIENT_SECRET ?? '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case '--base-url':
        options.baseUrl = next ?? '';
        index += 1;
        break;
      case '--cf-access-client-id':
        options.cfAccessClientId = next ?? '';
        index += 1;
        break;
      case '--cf-access-client-secret':
        options.cfAccessClientSecret = next ?? '';
        index += 1;
        break;
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`smoke-staging: unknown argument: ${arg}`);
        printUsage();
        process.exit(1);
    }
  }

  return options;
}

function buildHeaders(options) {
  const headers = { Accept: 'application/json' };
  if (options.cfAccessClientId && options.cfAccessClientSecret) {
    headers['CF-Access-Client-Id'] = options.cfAccessClientId;
    headers['CF-Access-Client-Secret'] = options.cfAccessClientSecret;
  }
  return headers;
}

async function fetchJson(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'manual',
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body, headers: response.headers };
  } finally {
    clearTimeout(timer);
  }
}

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.baseUrl) {
    console.error('smoke-staging: --base-url is required');
    printUsage();
    process.exit(1);
  }

  const base = options.baseUrl.replace(/\/+$/, '');
  const headers = buildHeaders(options);

  console.log(`smoke-staging: checking ${base}`);

  const live = await fetchJson(`${base}/api/health/live`, headers);
  assertOk(live.status === 200, `liveness expected 200, got ${live.status}`);
  assertOk(
    live.body && typeof live.body === 'object' && live.body.status === 'ok',
    'liveness body.status must be ok',
  );
  console.log('smoke-staging: liveness OK');

  const ready = await fetchJson(`${base}/api/health/ready`, headers);
  assertOk(ready.status === 200, `readiness expected 200, got ${ready.status}`);
  assertOk(
    ready.body && typeof ready.body === 'object' && ready.body.status === 'ok',
    'readiness body.status must be ok',
  );
  console.log('smoke-staging: readiness OK');

  console.log('smoke-staging: passed');
}

main().catch((error) => {
  console.error(`smoke-staging: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
