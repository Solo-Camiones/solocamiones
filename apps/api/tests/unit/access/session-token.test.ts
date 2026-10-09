import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { SESSION_TOKEN_BYTES } from '../../../src/features/access/constants.js';
import {
  generateSessionToken,
  hashSessionToken,
} from '../../../src/features/access/session-token.js';

describe('session token', () => {
  it('generates unique opaque hex tokens of the configured length', () => {
    const first = generateSessionToken();
    const second = generateSessionToken();

    expect(first).toMatch(/^[0-9a-f]+$/);
    expect(first).toHaveLength(SESSION_TOKEN_BYTES * 2);
    expect(second).toHaveLength(SESSION_TOKEN_BYTES * 2);
    expect(first).not.toBe(second);
  });

  it('hashes the cookie value with SHA-256 hex using a stable encoding', () => {
    const token = generateSessionToken();
    const expected = createHash('sha256').update(token, 'utf8').digest('hex');

    expect(hashSessionToken(token)).toBe(expected);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).toHaveLength(64);
    expect(hashSessionToken(token)).not.toBe(token);
    expect(hashSessionToken(generateSessionToken())).not.toBe(hashSessionToken(token));
  });
});
