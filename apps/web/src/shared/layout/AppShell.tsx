import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../features/auth/useAuth';
import { useAppCapabilities } from '../config/CapabilitiesProvider';
import { BrandMark, Button } from '../ui';
import { ChevronLeftIcon, XIcon } from '../ui/icons';
import { COMMERCIAL_SIDEBAR_ID } from './breakpoints';
import { CommercialSidebar } from './CommercialSidebar';
import { DemoControls } from './DemoControls';
import { NavDrawer } from './NavDrawer';
import { useCommercialNavMode } from './useCommercialNavMode';
import { UserMenu } from './UserMenu';

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="currentColor"
        d="M4 6.75h16a.75.75 0 0 0 0-1.5H4a.75.75 0 0 0 0 1.5Zm0 6h16a.75.75 0 0 0 0-1.5H4a.75.75 0 0 0 0 1.5Zm0 6h16a.75.75 0 0 0 0-1.5H4a.75.75 0 0 0 0 1.5Z"
      />
    </svg>
  );
}

/**
 * Desktop shell for Administrator and Seller.
 * Overflow lives on the content column only so a drawer is not clipped.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const capabilities = useAppCapabilities();
  const location = useLocation();
  const navMode = useCommercialNavMode();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [compactCollapsed, setCompactCollapsed] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (navMode !== 'drawer') {
      setDrawerOpen(false);
    }

    if (navMode === 'full') {
      setCompactCollapsed(false);
    }
  }, [navMode]);

  if (!user) {
    return null;
  }

  const showInlineSidebar =
    !user.mustChangePassword &&
    (navMode === 'full' || (navMode === 'compact' && !compactCollapsed));
  const showMenuButton =
    !user.mustChangePassword &&
    (navMode === 'drawer' || (navMode === 'compact' && compactCollapsed));
  const menuExpanded = navMode === 'drawer' ? drawerOpen : !compactCollapsed;

  function closeOverlayNav() {
    setDrawerOpen(false);
  }

  const collapseButton = (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0 text-white hover:bg-shell-muted hover:text-white"
      aria-label="Ocultar menú"
      aria-controls={COMMERCIAL_SIDEBAR_ID}
      aria-expanded
      onClick={() => setCompactCollapsed(true)}
    >
      <ChevronLeftIcon />
    </Button>
  );

  const closeDrawerButton = (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0 text-white hover:bg-shell-muted hover:text-white"
      aria-label="Cerrar menú"
      onClick={closeOverlayNav}
    >
      <XIcon />
    </Button>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      {showInlineSidebar ? (
        <CommercialSidebar
          role={user.role}
          density={navMode === 'compact' ? 'compact' : 'full'}
          headerAction={navMode === 'compact' ? collapseButton : undefined}
        />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface text-navy">
        <header className="flex min-w-0 shrink-0 items-center gap-2 border-b border-navy-100 bg-white px-3 py-3 sm:gap-3 sm:px-6">
          {showMenuButton ? (
            <Button
              variant="secondary"
              size="icon"
              aria-label={drawerOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuExpanded}
              aria-controls={COMMERCIAL_SIDEBAR_ID}
              onClick={() => {
                if (navMode === 'drawer') {
                  setDrawerOpen((open) => !open);
                  return;
                }

                setCompactCollapsed(false);
              }}
            >
              <MenuIcon />
            </Button>
          ) : null}

          <BrandMark
            className="min-w-0 flex-1"
            showLogo={showMenuButton}
            eyebrow={capabilities.prototypeControls ? 'Prototipo' : undefined}
          />
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {!user.mustChangePassword && <DemoControls />}
            <UserMenu user={user} onLogout={logout} />
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain">
          <div className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      <NavDrawer
        open={!user.mustChangePassword && navMode === 'drawer' && drawerOpen}
        onClose={closeOverlayNav}
      >
        <CommercialSidebar
          role={user.role}
          density="full"
          headerAction={closeDrawerButton}
          onNavigate={closeOverlayNav}
        />
      </NavDrawer>
    </div>
  );
}
