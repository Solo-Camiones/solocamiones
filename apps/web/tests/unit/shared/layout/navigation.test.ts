import { describe, expect, it } from 'vitest';

import {
  defaultPathForRole,
  isKnownDesktopRoute,
  isKnownMechanicRoute,
  isNavItemActive,
  isPathAllowedForRole,
  isRouteAllowedForRole,
  layoutAccessDecision,
  navGroupsForRole,
  navItemsForRole,
  postLoginPath,
  shouldShowNavGroupHeadings,
} from '../../../../src/shared/layout/navigation';
import { CAPABILITY_PRESETS } from '../../../../src/shared/config/capabilities';

const prototype = CAPABILITY_PRESETS.prototype;

describe('role navigation', () => {
  it('shows ten desktop entries to administrators and five to sellers', () => {
    expect(navItemsForRole('ADMINISTRATOR', prototype)).toHaveLength(10);
    expect(navItemsForRole('SELLER', prototype).map((item) => item.id)).toEqual([
      'dashboard',
      'inventory',
      'sales',
      'customers',
      'receivables',
    ]);
    expect(navItemsForRole('MECHANIC', prototype)).toEqual([]);
  });

  it('groups administrator items by work intent and omits empty groups', () => {
    const adminGroups = navGroupsForRole('ADMINISTRATOR', prototype);

    expect(adminGroups.map((group) => group.id)).toEqual([
      'operation',
      'administration',
      'finance',
    ]);
    expect(adminGroups[0]?.items.map((item) => item.id)).toEqual([
      'dashboard',
      'inventory',
      'sales',
      'customers',
      'work-orders',
    ]);
    expect(adminGroups[2]?.items.map((item) => item.id)).toEqual([
      'receivables',
      'profitability',
      'recovery',
    ]);
    const sellerGroups = navGroupsForRole('SELLER', prototype);
    expect(sellerGroups.map((group) => group.id)).toEqual(['operation', 'finance']);
    expect(shouldShowNavGroupHeadings(sellerGroups)).toBe(true);
    expect(navGroupsForRole('MECHANIC', prototype)).toEqual([]);

    const releaseOneAdmin = navGroupsForRole('ADMINISTRATOR', CAPABILITY_PRESETS['release-1']);
    expect(releaseOneAdmin.map((group) => group.id)).toEqual(['administration']);
    expect(releaseOneAdmin.flatMap((group) => group.items.map((item) => item.id))).toEqual(['users']);
  });

  it('maps every role to its correct home', () => {
    expect(defaultPathForRole('ADMINISTRATOR', prototype)).toBe('/dashboard');
    expect(defaultPathForRole('SELLER', prototype)).toBe('/dashboard');
    expect(defaultPathForRole('MECHANIC', prototype)).toBe('/mechanic');
    expect(defaultPathForRole('ADMINISTRATOR', CAPABILITY_PRESETS['release-1'])).toBe('/users');
    expect(defaultPathForRole('SELLER', CAPABILITY_PRESETS['release-1'])).toBe('/profile');
  });

  it('recognizes registered route patterns and rejects typos', () => {
    expect(isKnownDesktopRoute('/inventory/MOT-001')).toBe(true);
    expect(isKnownDesktopRoute('/sales/draft/INV-DRAFT-01')).toBe(true);
    expect(isKnownDesktopRoute('/work-orders/OD-DEMO-060')).toBe(true);
    expect(isKnownDesktopRoute('/receivables')).toBe(true);
    expect(isKnownDesktopRoute('/profile')).toBe(true);
    expect(isKnownDesktopRoute('/invenray')).toBe(false);
    expect(isKnownMechanicRoute('/mechanic/pending')).toBe(true);
    expect(isKnownMechanicRoute('/mechanic/orders/OD-DEMO-060')).toBe(true);
    expect(isKnownMechanicRoute('/mechanic/nope')).toBe(false);
  });

  it('activates only the matching known navigation section', () => {
    expect(isNavItemActive('/inventory/MOT-001', '/inventory')).toBe(true);
    expect(isNavItemActive('/sales/draft/INV-DRAFT-01', '/sales')).toBe(true);
    expect(isNavItemActive('/work-orders/OD-DEMO-060', '/work-orders')).toBe(true);
    expect(isNavItemActive('/inventory/MOT-001', '/sales')).toBe(false);
    expect(isNavItemActive('/inventory/nope/extra', '/inventory')).toBe(false);
  });

  it('enforces administrator-only desktop sections', () => {
    expect(isRouteAllowedForRole('/customers', 'SELLER', prototype)).toBe(true);
    expect(isRouteAllowedForRole('/work-orders', 'SELLER', prototype)).toBe(false);
    expect(isRouteAllowedForRole('/work-orders/OD-DEMO-060', 'SELLER', prototype)).toBe(false);
    expect(isRouteAllowedForRole('/users', 'SELLER', prototype)).toBe(false);
    expect(isRouteAllowedForRole('/profitability', 'ADMINISTRATOR', prototype)).toBe(true);
  });

  it('blocks a role-permitted URL when its capability is disabled', () => {
    expect(isRouteAllowedForRole('/inventory', 'ADMINISTRATOR', CAPABILITY_PRESETS['release-1'])).toBe(
      false,
    );
    expect(isRouteAllowedForRole('/users', 'ADMINISTRATOR', CAPABILITY_PRESETS['release-1'])).toBe(
      true,
    );
  });

  it('does not treat a previous role URL as a valid post-login landing', () => {
    expect(isPathAllowedForRole('/users', 'MECHANIC', prototype)).toBe(false);
    expect(isPathAllowedForRole('/profile', 'MECHANIC', prototype)).toBe(false);
    expect(isPathAllowedForRole('/mechanic/pending', 'ADMINISTRATOR', prototype)).toBe(false);
    expect(isPathAllowedForRole('/users', 'SELLER', prototype)).toBe(false);
    expect(isPathAllowedForRole('/inventory', 'SELLER', prototype)).toBe(true);
    expect(isPathAllowedForRole('/mechanic/pending', 'MECHANIC', prototype)).toBe(true);
  });

  it('falls back to the role home when the saved login path is forbidden', () => {
    expect(postLoginPath('/users', 'MECHANIC', prototype)).toBe('/mechanic');
    expect(postLoginPath('/mechanic/pending', 'ADMINISTRATOR', prototype)).toBe('/dashboard');
    expect(postLoginPath('/users', 'SELLER', prototype)).toBe('/dashboard');
    expect(postLoginPath('/inventory', 'SELLER', prototype)).toBe('/inventory');
    expect(postLoginPath(null, 'MECHANIC', prototype)).toBe('/mechanic');
  });
});

const DESKTOP_ROLES = ['ADMINISTRATOR', 'SELLER'] as const;
const MECHANIC_ROLES = ['MECHANIC'] as const;

describe('layoutAccessDecision', () => {
  it('allows a seller into the desktop shell', () => {
    expect(layoutAccessDecision('/inventory', 'SELLER', [...DESKTOP_ROLES])).toBe('allow');
  });

  it('forbids a mechanic from a real desktop screen', () => {
    expect(layoutAccessDecision('/inventory', 'MECHANIC', [...DESKTOP_ROLES])).toBe('forbidden');
  });

  it('returns 404 for a mechanic typo that is not a registered route', () => {
    expect(layoutAccessDecision('/invenray', 'MECHANIC', [...DESKTOP_ROLES])).toBe('not_found');
  });

  it('forbids an administrator from the mechanic app', () => {
    expect(layoutAccessDecision('/mechanic/pending', 'ADMINISTRATOR', [...MECHANIC_ROLES])).toBe(
      'forbidden',
    );
  });

  it('returns 404 for an unknown mechanic subpath', () => {
    expect(layoutAccessDecision('/mechanic/nope', 'ADMINISTRATOR', [...MECHANIC_ROLES])).toBe(
      'not_found',
    );
  });
});
