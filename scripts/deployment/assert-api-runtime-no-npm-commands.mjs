#!/usr/bin/env node
/**
 * Regression guard: the API runtime image removes npm/npx (Trivy).
 * Compose one-shots that use that image must not invoke `npm` as the command.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../..');
const DOCKERFILE = resolve(ROOT, 'apps/api/Dockerfile');
const COMPOSE_FILES = [
  resolve(ROOT, 'infra/vps/compose.yaml'),
  resolve(ROOT, 'docker-compose.yml'),
];

/** Inline array form: command: ['npm', ...] or command: ["npm", ...] */
const NPM_INLINE_ARRAY_COMMAND = /command:\s*\[\s*['"]npm['"]/;

/** Own-line `command:` key (block list follows on subsequent lines). */
const COMMAND_BLOCK_KEY = /^command:\s*$/;

/** YAML list item under an indented `command:` block. */
const COMMAND_LIST_ITEM = /^[ \t]+-[ \t]+(.*)$/;

/**
 * Detects compose `command:` values that invoke npm.
 * Line-oriented scanning avoids nested quantifiers that cause ReDoS.
 */
export function composeTextUsesNpmCommand(text) {
  if (NPM_INLINE_ARRAY_COMMAND.test(text)) {
    return true;
  }

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!COMMAND_BLOCK_KEY.test(lines[index])) {
      continue;
    }

    for (let itemIndex = index + 1; itemIndex < lines.length; itemIndex += 1) {
      const listItem = COMMAND_LIST_ITEM.exec(lines[itemIndex]);
      if (!listItem) {
        break;
      }
      if (/^npm\b/.test(listItem[1])) {
        return true;
      }
    }
  }

  return false;
}

function main() {
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

  const offenders = [];
  for (const file of COMPOSE_FILES) {
    const text = readFileSync(file, 'utf8');
    if (composeTextUsesNpmCommand(text)) {
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
}

const isExecutedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
  main();
}
