import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_PRESETS,
  enabledPosLineTypes,
  parseCapabilityPreset,
  resolveCapabilities,
} from '../../../../src/shared/config/capabilities';
import {
  defaultPathForRole,
  isMechanicPathAllowed,
  isRouteAllowedForRole,
  navItemsForRole,
} from '../../../../src/shared/layout/navigation';

describe('capability presets follow the Development Plan', () => {
  it('exposes users, customers, catalogs and sales in HTTP mode even with prototype flags', () => {
    const capabilities = resolveCapabilities({
      VITE_USE_MOCK_API: 'false',
      VITE_CAPABILITIES_PRESET: 'prototype',
      VITE_ENABLE_DEMO_CONTROLS: 'true',
      DEV: true,
    });
    expect(capabilities.users).toBe(true);
    expect(capabilities.customers).toBe(true);
    expect(capabilities.catalogs).toBe(true);
    expect(capabilities.sales).toBe(true);
    expect(capabilities.profitability).toBe(true);
    expect(capabilities.payments).toBe(true);
    expect(capabilities.invoiceCancellation).toBe(true);
    expect(capabilities.inventory).toBe(false);
    expect(isRouteAllowedForRole('/users', 'ADMINISTRATOR', capabilities)).toBe(true);
    expect(isRouteAllowedForRole('/catalogs', 'ADMINISTRATOR', capabilities)).toBe(true);
    expect(isRouteAllowedForRole('/catalogs', 'SELLER', capabilities)).toBe(false);
    expect(isRouteAllowedForRole('/customers', 'SELLER', capabilities)).toBe(true);
    expect(isRouteAllowedForRole('/sales', 'SELLER', capabilities)).toBe(true);
    expect(isRouteAllowedForRole('/sales', 'MECHANIC', capabilities)).toBe(false);
    expect(isRouteAllowedForRole('/customers', 'MECHANIC', capabilities)).toBe(false);
    expect(navItemsForRole('MECHANIC', capabilities)).toEqual([]);
    expect(navItemsForRole('SELLER', capabilities).map((item) => item.id)).toEqual(
      expect.arrayContaining(['sales', 'customers']),
    );
    expect(navItemsForRole('SELLER', capabilities).map((item) => item.id)).not.toContain(
      'profitability',
    );
    expect(navItemsForRole('ADMINISTRATOR', capabilities).map((item) => item.id)).toContain(
      'profitability',
    );
    expect(isRouteAllowedForRole('/profitability', 'ADMINISTRATOR', capabilities)).toBe(true);
    expect(isRouteAllowedForRole('/profitability', 'SELLER', capabilities)).toBe(false);
    expect(navItemsForRole('SELLER', capabilities).map((item) => item.id)).not.toContain('inventory');
    expect(enabledPosLineTypes(capabilities).map((entry) => entry.value)).toEqual([
      'GENERIC',
      'EXTERNAL',
      'SERVICE',
      'DELIVERY',
    ]);
    expect(isMechanicPathAllowed('/mechanic/pending', capabilities)).toBe(false);
    expect(isMechanicPathAllowed('/mechanic/profile', capabilities)).toBe(true);
  });

  it('treats an unset mock flag as HTTP Access/Users plus customers, services and sales', () => {
    const capabilities = resolveCapabilities({
      VITE_CAPABILITIES_PRESET: 'prototype',
      VITE_ENABLE_DEMO_CONTROLS: 'true',
      DEV: true,
    });
    expect(capabilities.users).toBe(true);
    expect(capabilities.customers).toBe(true);
    expect(capabilities.catalogs).toBe(true);
    expect(capabilities.sales).toBe(true);
    expect(capabilities.inventory).toBe(false);
    expect(capabilities.prototypeControls).toBe(false);
  });

  it('Release 1 is only access and user administration', () => {
    const capabilities = CAPABILITY_PRESETS['release-1'];

    expect(navItemsForRole('ADMINISTRATOR', capabilities).map((item) => item.id)).toEqual([
      'users',
    ]);
    expect(navItemsForRole('SELLER', capabilities)).toEqual([]);
    expect(isRouteAllowedForRole('/dashboard', 'SELLER', capabilities)).toBe(false);
    expect(defaultPathForRole('ADMINISTRATOR', capabilities)).toBe('/users');
    expect(defaultPathForRole('SELLER', capabilities)).toBe('/profile');
    expect(isRouteAllowedForRole('/sales', 'SELLER', capabilities)).toBe(false);
    expect(enabledPosLineTypes(capabilities)).toEqual([]);
    expect(capabilities.prototypeControls).toBe(false);
  });

  it('Release 2 enables billing without payments, inventory, or stock lines', () => {
    const capabilities = CAPABILITY_PRESETS['release-2'];

    expect(navItemsForRole('SELLER', capabilities).map((item) => item.id)).toEqual([
      'dashboard',
      'sales',
      'customers',
    ]);
    expect(isRouteAllowedForRole('/profitability', 'ADMINISTRATOR', capabilities)).toBe(true);
    expect(isRouteAllowedForRole('/inventory', 'SELLER', capabilities)).toBe(false);
    expect(enabledPosLineTypes(capabilities).map((entry) => entry.value)).toEqual([
      'GENERIC',
      'EXTERNAL',
      'SERVICE',
      'DELIVERY',
    ]);
    expect(capabilities.payments).toBe(false);
    expect(capabilities.invoiceCancellation).toBe(false);
  });

  it('Release 3 adds payments and cancellation still without inventory', () => {
    const capabilities = CAPABILITY_PRESETS['release-3'];

    expect(capabilities.payments).toBe(true);
    expect(capabilities.invoiceCancellation).toBe(true);
    expect(isRouteAllowedForRole('/receivables', 'SELLER', capabilities)).toBe(true);
    expect(capabilities.inventory).toBe(false);
    expect(capabilities.inventorySales).toBe(false);
  });

  it('Release 4 adds independent inventory and catalogs without selling stock', () => {
    const capabilities = CAPABILITY_PRESETS['release-4'];

    expect(isRouteAllowedForRole('/inventory/MOT-001', 'SELLER', capabilities)).toBe(true);
    expect(isRouteAllowedForRole('/catalogs', 'ADMINISTRATOR', capabilities)).toBe(true);
    expect(capabilities.hierarchy).toBe(false);
    expect(capabilities.inventorySales).toBe(false);
    expect(enabledPosLineTypes(capabilities).map((entry) => entry.value)).not.toContain('ITEM');
  });

  it('Release 5 enables inventory-backed POS lines before hierarchy and work orders', () => {
    const capabilities = CAPABILITY_PRESETS['release-5'];

    expect(enabledPosLineTypes(capabilities).map((entry) => entry.value)).toEqual([
      'ITEM',
      'QTY',
      'GENERIC',
      'EXTERNAL',
      'SERVICE',
      'DELIVERY',
    ]);
    expect(capabilities.hierarchy).toBe(false);
    expect(capabilities.workOrders).toBe(false);
  });

  it('Release 6–8 add hierarchy, work orders, then recovery', () => {
    expect(CAPABILITY_PRESETS['release-6'].hierarchy).toBe(true);
    expect(CAPABILITY_PRESETS['release-6'].workOrders).toBe(false);
    expect(CAPABILITY_PRESETS['release-7'].workOrders).toBe(true);
    expect(CAPABILITY_PRESETS['release-7'].recovery).toBe(false);
    expect(
      isRouteAllowedForRole('/recovery', 'ADMINISTRATOR', CAPABILITY_PRESETS['release-8']),
    ).toBe(true);
  });

  it('keeps the prototype preset complete, including mechanic work orders', () => {
    const capabilities = CAPABILITY_PRESETS.prototype;

    expect(navItemsForRole('ADMINISTRATOR', capabilities)).toHaveLength(10);
    expect(isMechanicPathAllowed('/mechanic/pending', capabilities)).toBe(true);
    expect(defaultPathForRole('MECHANIC', capabilities)).toBe('/mechanic');
  });

  it('blocks mechanic queue URLs when workOrders is off and still allows profile', () => {
    const capabilities = CAPABILITY_PRESETS['release-1'];

    expect(isMechanicPathAllowed('/mechanic/pending', capabilities)).toBe(false);
    expect(isMechanicPathAllowed('/mechanic/profile', capabilities)).toBe(true);
    expect(defaultPathForRole('MECHANIC', capabilities)).toBe('/mechanic/profile');
  });

  it('turns demo controls off in a production prototype build unless explicitly forced', () => {
    expect(parseCapabilityPreset('unknown')).toBe('prototype');
    expect(
      resolveCapabilities({
        VITE_USE_MOCK_API: 'true',
        VITE_CAPABILITIES_PRESET: 'prototype',
        DEV: false,
      }).prototypeControls,
    ).toBe(false);
    expect(
      resolveCapabilities({
        VITE_USE_MOCK_API: 'true',
        VITE_CAPABILITIES_PRESET: 'release-1',
        VITE_ENABLE_DEMO_CONTROLS: 'true',
        DEV: true,
      }).prototypeControls,
    ).toBe(true);
  });
});
