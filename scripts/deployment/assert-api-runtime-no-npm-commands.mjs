#!/usr/bin/env node
/**
 * Regression guard: the API runtime image removes npm/npx (Trivy).
 * Compose one-shots that use that image must not invoke `npm` as the command.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const DOCKERFILE = resolve(ROOT, 'apps/api/Dockerfile');
const COMPOSE_FILES = [
  resolve(ROOT, 'infra/vps/compose.yaml'),
  resolve(ROOT, 'docker-compose.yml'),
];

const dockerfile = readFileSync(DOCKERFILE, 'utf8');
const removesNpm =
  /rm\s+-f\s+[^\n]*\/usr\/local\/bin\/npm/.test(dockerfile) ||
  /rm\s+-f[\s\S]*?\/usr\/local\/bin\/npm/.test(dockerfile);

if (!removesNpm) {
  console.log(
    'assert-api-runtime-no-npm-commands: Dockerfile no longer removes npm; skipping compose check',
  );
  process.exit(0);
}

const npmCommandPattern =
  /command:\s*\[\s*['"]npm['"]|command:\s*\n(?:\s+-\s+.*\n)*?\s+-\s+npm\b/;

const offenders = [];
for (const file of COMPOSE_FILES) {
  const text = readFileSync(file, 'utf8');
  if (npmCommandPattern.test(text)) {
    offenders.push(file);
  }
}

if (offenders.length > 0) {
  console.error(
    'assert-api-runtime-no-npm-commands: API runtime image has no npm, but these compose files still use command: npm',
  );
  for (const file of offenders) {
    console.error(`  - ${file}`);
  }
  console.error('Use: working_dir: /app/apps/api + command: [node, --run, <script>]');
  process.exit(1);
}

console.log('assert-api-runtime-no-npm-commands: OK');
