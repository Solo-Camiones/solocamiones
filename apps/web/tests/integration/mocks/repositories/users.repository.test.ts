import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mockAuthRepository } from '../../../../src/mocks/repositories/MockAuthRepository';
import { mockUserRepository } from '../../../../src/mocks/repositories/MockUserRepository';
import { getMockState, resetMockState } from '../../../../src/mocks/state';
import { resetDemoData } from '../../../../src/mocks/demo-controls';
import { signInAs } from '../../../support/session';

describe('MockUserRepository', () => {
  beforeEach(() => {
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('creates a user who can log in with the server-assigned initial password', async () => {
    signInAs('ADMINISTRATOR');

    const saved = await mockUserRepository.save({
      name: 'María López',
      username: 'maria',
      role: 'SELLER',
      active: true,
    });

    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.value).not.toHaveProperty('password');
      expect(saved.value.username).toBe('maria');
    }

    const login = await mockAuthRepository.login('maria', 'solocamiones');
    expect(login.ok).toBe(true);
  });

  it('blocks login after deactivation and restores only seed users on demo reset', async () => {
    signInAs('ADMINISTRATOR');

    await mockUserRepository.save({
      name: 'María López',
      username: 'maria',
      role: 'SELLER',
      active: true,
    });
    await mockUserRepository.save({
      id: 'U-MARIA',
      name: 'María López',
      username: 'maria',
      role: 'SELLER',
      active: false,
    });

    const login = await mockAuthRepository.login('maria', 'clave123');
    expect(login.ok).toBe(false);
    if (!login.ok) {
      expect(login.error.code).toBe('FORBIDDEN');
    }

    const reset = resetDemoData();
    expect(reset.ok).toBe(true);
    expect(getMockState().users).toHaveLength(4);
    expect(getMockState().users.some((user) => user.username === 'maria')).toBe(false);
  });

  it('omits passwords from list reads', async () => {
    signInAs('ADMINISTRATOR');

    const listed = await mockUserRepository.list();

    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value.items).toHaveLength(4);
      expect(listed.value.items.every((user) => !('password' in user))).toBe(true);
    }
  });

  it('denies seller and mechanic management', async () => {
    signInAs('SELLER');
    const seller = await mockUserRepository.list();
    expect(seller.ok).toBe(false);

    signInAs('MECHANIC');
    const mechanic = await mockUserRepository.save({
      name: 'Intruso',
      username: 'intruso',
      role: 'MECHANIC',
      active: true,
    });
    expect(mechanic.ok).toBe(false);
    if (!mechanic.ok) {
      expect(mechanic.error.code).toBe('FORBIDDEN');
    }
  });
});
