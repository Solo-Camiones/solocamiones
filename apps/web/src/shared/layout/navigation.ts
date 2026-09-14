import type { Role } from '../../api/contracts/entities';
import { useMockApi } from '../../api/client/http-client';
import {
  getAppCapabilities,
  type AppCapabilities,
  type AppCapability,
} from '../config/capabilities';

/** Work-intent groupings for the commercial sidebar — not nested menus. */
export const NAV_GROUPS = [
  { id: 'operation', label: 'Operación' },
  { id: 'administration', label: 'Administración' },
  { id: 'finance', label: 'Finanzas y control' },
] as const;

export type NavGroupId = (typeof NAV_GROUPS)[number]['id'];

export type NavItem = {
  id: string;
  label: string;
  path: string;
  roles: Role[];
  group: NavGroupId;
  /** When set, the item is hidden and its URLs are blocked unless the capability is on. */
  capability?: AppCapability;
};

export type NavGroup = {
  id: NavGroupId;
  label: string;
  items: NavItem[];
};

/** Desktop sidebar entries — Admin sees 10, Seller sees 5 when all capabilities are on. */
export const DESKTOP_NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Inicio',
    path: '/dashboard',
    roles: ['ADMINISTRATOR', 'SELLER'],
    group: 'operation',
    capability: 'sales',
  },
  {
    id: 'inventory',
    label: 'Inventario',
    path: '/inventory',
    roles: ['ADMINISTRATOR', 'SELLER'],
    group: 'operation',
    capability: 'inventory',
  },
  {
    id: 'sales',
    label: 'Ventas y Facturas',
    path: '/sales',
    roles: ['ADMINISTRATOR', 'SELLER'],
    group: 'operation',
    capability: 'sales',
  },
  {
    id: 'customers',
    label: 'Clientes',
    path: '/customers',
    roles: ['ADMINISTRATOR', 'SELLER'],
    group: 'operation',
    capability: 'customers',
  },
  {
    id: 'receivables',
    label: 'Cuentas por cobrar',
    path: '/receivables',
    roles: ['ADMINISTRATOR', 'SELLER'],
    group: 'finance',
    capability: 'payments',
  },
  {
    id: 'work-orders',
    label: 'Órdenes de Trabajo',
    path: '/work-orders',
    roles: ['ADMINISTRATOR'],
    group: 'operation',
    capability: 'workOrders',
  },
  {
    id: 'catalogs',
    label: 'Catálogos',
    path: '/catalogs',
    roles: ['ADMINISTRATOR'],
    group: 'administration',
    capability: 'catalogs',
  },
  {
    id: 'users',
    label: 'Usuarios',
    path: '/users',
    roles: ['ADMINISTRATOR'],
    group: 'administration',
    capability: 'users',
  },
  {
    id: 'profitability',
    label: 'Rentabilidad',
    path: '/profitability',
    roles: ['ADMINISTRATOR'],
    group: 'finance',
    capability: 'profitability',
  },
  {
    id: 'recovery',
    label: 'Administración y Recuperación',
    path: '/recovery',
    roles: ['ADMINISTRATOR'],
    group: 'finance',
    capability: 'recovery',
  },
];

function isNavItemEnabled(item: NavItem, capabilities: AppCapabilities): boolean {
  // Inicio is keyed off `sales`, but dashboard HTTP is not part of M21.
  if (item.id === 'dashboard' && !useMockApi) {
    return false;
  }
  return !item.capability || capabilities[item.capability];
}

export function navItemsForRole(
  role: Role,
  capabilities: AppCapabilities = getAppCapabilities(),
): NavItem[] {
  return DESKTOP_NAV_ITEMS.filter(
    (item) => item.roles.includes(role) && isNavItemEnabled(item, capabilities),
  );
}

/** Visible groups only — empty groups stay out of the sidebar when capabilities hide their items. */
export function navGroupsForRole(
  role: Role,
  capabilities: AppCapabilities = getAppCapabilities(),
): NavGroup[] {
  const items = navItemsForRole(role, capabilities);

  return NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: items.filter((item) => item.group === group.id),
  })).filter((group) => group.items.length > 0);
}

/** A single group (typical Seller menu) does not need a heading of its own. */
export function shouldShowNavGroupHeadings(groups: NavGroup[]): boolean {
  return groups.length > 1;
}

/** Registered desktop routes — unknown paths should 404, not unauthorized. */
const KNOWN_DESKTOP_ROUTE_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/dashboard$/,
  /^\/inventory$/,
  /^\/inventory\/[^/]+$/,
  /^\/sales$/,
  /^\/sales\/draft\/[^/]+$/,
  /^\/sales\/[^/]+$/,
  /^\/customers$/,
  /^\/receivables$/,
  /^\/work-orders$/,
  /^\/work-orders\/[^/]+$/,
  /^\/catalogs$/,
  /^\/users$/,
  /^\/profitability$/,
  /^\/recovery$/,
  /^\/profile$/,
];

const KNOWN_MECHANIC_ROUTE_PATTERNS: RegExp[] = [
  /^\/mechanic$/,
  /^\/mechanic\/pending$/,
  /^\/mechanic\/mine$/,
  /^\/mechanic\/orders\/[^/]+$/,
  /^\/mechanic\/profile$/,
];

export function isKnownDesktopRoute(pathname: string): boolean {
  return KNOWN_DESKTOP_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function isKnownMechanicRoute(pathname: string): boolean {
  return KNOWN_MECHANIC_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

export type LayoutAccessDecision = 'allow' | 'forbidden' | 'not_found';

/**
 * Distinguishes “wrong role for a real screen” from “this URL does not exist”.
 * The desktop layout's splat otherwise swallows typos like /invenray and 401s a mechanic.
 */
export function layoutAccessDecision(
  pathname: string,
  userRole: Role,
  layoutRoles: Role[],
): LayoutAccessDecision {
  if (layoutRoles.includes(userRole)) {
    return 'allow';
  }

  const layoutIsMechanic = layoutRoles.length === 1 && layoutRoles[0] === 'MECHANIC';
  const pathExistsInThisLayout = layoutIsMechanic
    ? isKnownMechanicRoute(pathname)
    : isKnownDesktopRoute(pathname);

  return pathExistsInThisLayout ? 'forbidden' : 'not_found';
}

/** Sidebar active state — 404/unknown paths must not highlight a parent segment. */
export function isNavItemActive(pathname: string, itemPath: string): boolean {
  if (!isKnownDesktopRoute(pathname)) {
    return false;
  }

  if (pathname === itemPath) {
    return true;
  }

  if (itemPath === '/inventory' && /^\/inventory\/[^/]+$/.test(pathname)) {
    return true;
  }

  if (
    itemPath === '/sales' &&
    (/^\/sales\/draft\/[^/]+$/.test(pathname) || /^\/sales\/[^/]+$/.test(pathname))
  ) {
    return true;
  }

  if (itemPath === '/work-orders' && /^\/work-orders\/[^/]+$/.test(pathname)) {
    return true;
  }

  return false;
}

export function isRouteAllowedForRole(
  pathname: string,
  role: Role,
  capabilities: AppCapabilities = getAppCapabilities(),
): boolean {
  const match = DESKTOP_NAV_ITEMS.find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
  );

  if (!match) {
    return true;
  }

  return match.roles.includes(role) && isNavItemEnabled(match, capabilities);
}

/** Mechanic queue/order URLs require workOrders; profile remains available. */
export function isMechanicPathAllowed(
  pathname: string,
  capabilities: AppCapabilities = getAppCapabilities(),
): boolean {
  if (!isKnownMechanicRoute(pathname)) {
    return true;
  }

  if (pathname === '/mechanic' || pathname === '/mechanic/profile') {
    return true;
  }

  return capabilities.workOrders;
}

export function getRouteLabel(pathname: string): string | undefined {
  const match = DESKTOP_NAV_ITEMS.find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
  );

  return match?.label;
}

export function defaultPathForRole(
  role: Role,
  capabilities: AppCapabilities = getAppCapabilities(),
): string {
  switch (role) {
    case 'MECHANIC':
      return capabilities.workOrders ? '/mechanic' : '/mechanic/profile';
    case 'ADMINISTRATOR':
      if (capabilities.sales) {
        return useMockApi ? '/dashboard' : '/sales';
      }
      return capabilities.users ? '/users' : '/profile';
    case 'SELLER':
      if (capabilities.sales) {
        return useMockApi ? '/dashboard' : '/sales';
      }
      return '/profile';
  }
}

/**
 * Whether this identity may land on the URL after login.
 * Session expiry may restore `state.from`; explicit logout discards it. A path
 * from another role must not send the new user to UnauthorizedPage.
 */
export function isPathAllowedForRole(
  pathname: string,
  role: Role,
  capabilities: AppCapabilities = getAppCapabilities(),
): boolean {
  if (isKnownMechanicRoute(pathname)) {
    return role === 'MECHANIC' && isMechanicPathAllowed(pathname, capabilities);
  }

  if (isKnownDesktopRoute(pathname)) {
    return role !== 'MECHANIC' && isRouteAllowedForRole(pathname, role, capabilities);
  }

  return false;
}

/** Deep-link after login only when the new role can open that screen. */
export function postLoginPath(
  requestedPath: string | null,
  role: Role,
  capabilities: AppCapabilities = getAppCapabilities(),
): string {
  if (requestedPath && isPathAllowedForRole(requestedPath, role, capabilities)) {
    return requestedPath;
  }

  return defaultPathForRole(role, capabilities);
}
