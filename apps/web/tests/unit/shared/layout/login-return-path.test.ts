// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  markLogoutDiscardsReturnPath,
  resolvePostLoginRequestedPath,
} from '../../../../src/shared/layout/login-return-path';

afterEach(() => {
  sessionStorage.clear();
});

describe('login return path', () => {
  it('keeps a deep-link after session expiry', () => {
    expect(resolvePostLoginRequestedPath('/customers')).toBe('/customers');
  });

  it('drops the previous screen after an explicit logout', () => {
    markLogoutDiscardsReturnPath();
    expect(resolvePostLoginRequestedPath('/customers')).toBeNull();
  });
});
