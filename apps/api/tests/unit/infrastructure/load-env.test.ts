import { describe, expect, it } from 'vitest';

import { shouldLoadDotenvFile } from '../../../src/infrastructure/config/load-env.js';

describe('shouldLoadDotenvFile', () => {
  it('loads dotenv for local and test processes', () => {
    expect(shouldLoadDotenvFile({ NODE_ENV: 'development', APP_ENV: 'development' })).toBe(true);
    expect(shouldLoadDotenvFile({ NODE_ENV: 'test', APP_ENV: 'test' })).toBe(true);
    expect(shouldLoadDotenvFile({})).toBe(true);
  });

  it('never loads dotenv for staging, production, or NODE_ENV=production', () => {
    expect(shouldLoadDotenvFile({ APP_ENV: 'staging', NODE_ENV: 'production' })).toBe(false);
    expect(shouldLoadDotenvFile({ APP_ENV: 'production', NODE_ENV: 'production' })).toBe(false);
    expect(shouldLoadDotenvFile({ NODE_ENV: 'production' })).toBe(false);
  });
});
