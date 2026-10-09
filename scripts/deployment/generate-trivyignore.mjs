#!/usr/bin/env node
/**
 * Build a Trivy ignorefile from the reviewed vulnerability allowlist (M5).
 * Rejects missing fields and expired exceptions so CI cannot silently waive CVEs.
 *
 * Usage:
 *   node scripts/deployment/generate-trivyignore.mjs [allowlist.yml] [output]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const allowlistPath = path.resolve(
  process.argv[2] ?? path.join(rootDir, 'infra/security/vulnerability-allowlist.yml'),
);
const outputPath = path.resolve(process.argv[3] ?? path.join(rootDir, '.trivyignore.generated'));

function parseAllowlist(text) {
  const entries = [];
  let current = null;
  let inEntries = false;

  for (const raw of text.split(/\r?\n/)) {
    const stripped = raw.trim();
    if (!stripped || stripped.startsWith('#')) {
      continue;
    }
    if (stripped.startsWith('entries:')) {
      inEntries = true;
      continue;
    }
    if (!inEntries) {
      continue;
    }
    if (stripped.startsWith('- ')) {
      if (current) {
        entries.push(current);
      }
      current = {};
      const rest = stripped.slice(2);
      const colon = rest.indexOf(':');
      if (colon !== -1) {
        const key = rest.slice(0, colon).trim();
        const value = rest
          .slice(colon + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '');
        current[key] = value;
      }
      continue;
    }
    if (current && stripped.includes(':')) {
      const colon = stripped.indexOf(':');
      const key = stripped.slice(0, colon).trim();
      const value = stripped
        .slice(colon + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      current[key] = value;
    }
  }
  if (current) {
    entries.push(current);
  }
  return entries;
}

if (!fs.existsSync(allowlistPath)) {
  console.error(`generate-trivyignore: allowlist not found: ${allowlistPath}`);
  process.exit(1);
}

const entries = parseAllowlist(fs.readFileSync(allowlistPath, 'utf8'));
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const ids = [];

entries.forEach((entry, index) => {
  const missing = ['id', 'justification', 'owner', 'expires'].filter((field) => !entry[field]);
  if (missing.length > 0) {
    throw new Error(
      `generate-trivyignore: entry #${index + 1} missing required fields: ${missing.join(', ')}`,
    );
  }
  const expires = new Date(`${entry.expires}T00:00:00Z`);
  if (Number.isNaN(expires.getTime())) {
    throw new Error(
      `generate-trivyignore: entry #${index + 1} has invalid expires date: ${entry.expires}`,
    );
  }
  if (expires < today) {
    throw new Error(`generate-trivyignore: entry ${entry.id} expired on ${entry.expires}`);
  }
  ids.push(entry.id);
});

const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const lines = [
  '# GENERATED - do not edit. Source: infra/security/vulnerability-allowlist.yml',
  `# Generated at ${generatedAt}`,
  ...ids,
];
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`generate-trivyignore: wrote ${ids.length} exception(s) to ${outputPath}`);
