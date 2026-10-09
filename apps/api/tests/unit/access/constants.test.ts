import { describe, expect, it } from 'vitest';

import {
  isSessionCookieSecure,
  SESSION_COOKIE_SAME_SITE,
} from '../../../src/features/access/constants.js';

describe('session cookie policy', () => {
  it('keeps SameSite explicit and disables Secure outside production HTTPS', () => {
    expect(SESSION_COOKIE_SAME_SITE).toBe('lax');
    expect(isSessionCookieSecure('development')).toBe(false);
    expect(isSessionCookieSecure('test')).toBe(false);
    expect(isSessionCookieSecure(undefined)).toBe(false);
    expect(isSessionCookieSecure('production')).toBe(true);
  });
});
