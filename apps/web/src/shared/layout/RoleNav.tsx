import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import type { Role } from '../../api/contracts/entities';
import { useAppCapabilities } from '../config/CapabilitiesProvider';
import {
  BoxIcon,
  ChartIcon,
  ClipboardIcon,
  HomeIcon,
  PeopleIcon,
  ReceiptIcon,
  ShieldIcon,
  UserIcon,
  WalletIcon,
  WrenchIcon,
} from '../ui/icons';
import {
  isNavItemActive,
  navGroupsForRole,
  shouldShowNavGroupHeadings,
} from './navigation';

/** Maps nav item id to its sidebar icon. */
const NAV_ICONS: Record<string, ReactNode> = {
  dashboard: <HomeIcon />,
  inventory: <BoxIcon />,
  sales: <ReceiptIcon />,
  customers: <PeopleIcon />,
  receivables: <WalletIcon />,
  'work-orders': <WrenchIcon />,
  catalogs: <ClipboardIcon />,
  users: <UserIcon />,
  profitability: <ChartIcon />,
  recovery: <ShieldIcon />,
};

export type RoleNavProps = {
  role: Role;
  compact?: boolean;
  onNavigate?: () => void;
};

export function RoleNav({ role, compact = false, onNavigate }: RoleNavProps) {
  const location = useLocation();
  const groups = navGroupsForRole(role, useAppCapabilities());
  const showHeadings = shouldShowNavGroupHeadings(groups);

  return (
    <nav
      className={`flex-1 overflow-y-auto ${compact ? 'p-2' : 'p-3'}`}
      aria-label="Navegación principal"
    >
      {groups.map((group, index) => {
        const headingId = `nav-group-${group.id}`;
        const separateFromPrevious = showHeadings && index > 0;

        return (
          <div
            key={group.id}
            className={`space-y-1 ${separateFromPrevious ? 'mt-5 border-t border-white/15 pt-4' : ''}`}
            role={showHeadings ? 'group' : undefined}
            aria-labelledby={showHeadings ? headingId : undefined}
          >
            {showHeadings ? (
              <h2
                id={headingId}
                className="flex items-center gap-2 px-3 pb-2 text-xs font-semibold text-brand-light"
              >
                <span className="h-1 w-1 shrink-0 rounded-full bg-brand-light" aria-hidden />
                {group.label}
              </h2>
            ) : null}
            {group.items.map((item) => {
              const isActive = isNavItemActive(location.pathname, item.path);

              return (
                <NavLink
                  key={item.id}
                  to={item.path}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-lg text-sm font-medium transition-colors ${
                    compact ? 'px-2 py-2' : 'px-3 py-2'
                  } ${
                    isActive
                      ? 'border-l-2 border-brand-light bg-shell-muted text-brand-light'
                      : 'text-white/70 hover:bg-shell-muted hover:text-white'
                  }`}
                >
                  <span className="h-[18px] w-[18px] shrink-0">{NAV_ICONS[item.id]}</span>
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
