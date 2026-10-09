import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const featuresRoot = fileURLToPath(new URL('../../../src/features', import.meta.url));

function listTsFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      return listTsFiles(fullPath);
    }
    return fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') ? [fullPath] : [];
  });
}

describe('feature import boundary', () => {
  it('does not import mock repositories from features', () => {
    const offenders = listTsFiles(featuresRoot).filter((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      return (
        source.includes("from '../../mocks/repositories") ||
        source.includes('from "../../../mocks/repositories')
      );
    });

    expect(offenders).toEqual([]);
  });
});
