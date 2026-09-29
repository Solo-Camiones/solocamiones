import { describe, expect, it } from 'vitest';

import { parseAssistantPurgeArgs } from '../../../src/cli/assistant-purge-command.js';

describe('parseAssistantPurgeArgs', () => {
  it('parses dry-run and rejects unknown flags', () => {
    expect(parseAssistantPurgeArgs([])).toEqual({
      dryRun: false,
      help: false,
      unknown: [],
    });
    expect(parseAssistantPurgeArgs(['--dry-run'])).toEqual({
      dryRun: true,
      help: false,
      unknown: [],
    });
    expect(parseAssistantPurgeArgs(['--help']).help).toBe(true);
    expect(parseAssistantPurgeArgs(['--force']).unknown).toEqual(['--force']);
  });
});
