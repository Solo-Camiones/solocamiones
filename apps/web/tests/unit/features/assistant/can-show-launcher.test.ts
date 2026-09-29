import { describe, expect, it } from 'vitest';

import { canShowAssistantLauncher } from '../../../../src/features/assistant/can-show-launcher';

describe('canShowAssistantLauncher', () => {
  it('shows only for Administrator with capability and repository', () => {
    expect(
      canShowAssistantLauncher({
        role: 'ADMINISTRATOR',
        mustChangePassword: false,
        assistantCapability: true,
        hasRepository: true,
      }),
    ).toBe(true);
  });

  it('hides for Seller, Mechanic, capability off, mock (no repo), or forced password change', () => {
    expect(
      canShowAssistantLauncher({
        role: 'SELLER',
        mustChangePassword: false,
        assistantCapability: true,
        hasRepository: true,
      }),
    ).toBe(false);
    expect(
      canShowAssistantLauncher({
        role: 'MECHANIC',
        mustChangePassword: false,
        assistantCapability: true,
        hasRepository: true,
      }),
    ).toBe(false);
    expect(
      canShowAssistantLauncher({
        role: 'ADMINISTRATOR',
        mustChangePassword: false,
        assistantCapability: false,
        hasRepository: true,
      }),
    ).toBe(false);
    expect(
      canShowAssistantLauncher({
        role: 'ADMINISTRATOR',
        mustChangePassword: false,
        assistantCapability: true,
        hasRepository: false,
      }),
    ).toBe(false);
    expect(
      canShowAssistantLauncher({
        role: 'ADMINISTRATOR',
        mustChangePassword: true,
        assistantCapability: true,
        hasRepository: true,
      }),
    ).toBe(false);
  });
});
