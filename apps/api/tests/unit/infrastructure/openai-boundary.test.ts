import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const apiSrcRoot = fileURLToPath(new URL('../../../src', import.meta.url));
const openaiModuleRoot = join(apiSrcRoot, 'infrastructure', 'openai');

function listTsFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listTsFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('OpenAI SDK import boundary', () => {
  it('keeps openai imports inside infrastructure/openai', () => {
    const offenders: string[] = [];
    for (const filePath of listTsFiles(apiSrcRoot)) {
      if (filePath.startsWith(openaiModuleRoot)) continue;
      const source = readFileSync(filePath, 'utf8');
      if (/\bfrom\s+['"]openai(?:\/[^'"]*)?['"]/.test(source) || /\bimport\s*\(\s*['"]openai['"]/.test(source)) {
        offenders.push(relative(apiSrcRoot, filePath));
      }
    }
    expect(offenders).toEqual([]);
  });
});
