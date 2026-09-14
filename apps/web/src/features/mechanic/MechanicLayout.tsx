import { Outlet } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { DemoControls } from '../../shared/layout/DemoControls';
import { UserMenu } from '../../shared/layout/UserMenu';
import { BrandMark } from '../../shared/ui';
import { MechanicBottomNav } from './MechanicBottomNav';

/**
 * Mobile-first mechanic shell: header, scrolling work area, bottom nav.
 * Input text-base avoids iOS zoom on focus; h-dvh keeps the nav on screen.
 */
export function MechanicLayout() {
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[430px] min-w-0 flex-col bg-surface text-navy touch-manipulation [&_input]:min-h-12 [&_input]:text-base">
      <header className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-navy-100 bg-white px-4 py-2.5">
        <BrandMark showLogo className="min-w-0" />
        <div className="flex shrink-0 items-center gap-2">
          {!user.mustChangePassword && <DemoControls />}
          <UserMenu user={user} onLogout={logout} />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <Outlet />
      </main>

      {!user.mustChangePassword && <MechanicBottomNav />}
    </div>
  );
}
