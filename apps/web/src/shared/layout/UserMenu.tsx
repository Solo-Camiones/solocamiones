import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AuthUser } from '../../features/auth/AuthContext';
import { roleLabel } from '../auth/policies';
import { Button, ConfirmActionModal } from '../ui';
import { useTransition } from '../ui/useTransition';

export type UserMenuProps = {
  user: AuthUser;
  onLogout: () => Promise<void>;
};

export function UserMenu({ user, onLogout }: UserMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const state = useTransition(open, 100);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  function handleOpenProfile() {
    const path = user.role === 'MECHANIC' ? '/mechanic/profile' : '/profile';
    setOpen(false);
    navigate(path);
  }

  function requestLogout() {
    setOpen(false);
    setConfirmLogout(true);
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    await onLogout();
    setIsLoggingOut(false);
    setConfirmLogout(false);
    // AuthProvider clears the identity only after the server confirms logout.
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm text-navy hover:bg-navy-50"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Cuenta de ${user.name}`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand-dark">
          {user.name.charAt(0)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block font-medium">{user.name}</span>
          <span className="block text-xs text-navy-400">{roleLabel(user.role)}</span>
        </span>
      </button>

      {state !== 'unmounted' && (
        <div
          role={open ? 'menu' : undefined}
          aria-hidden={!open}
          className={`absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-lg border border-navy-100 bg-white py-1 shadow-lg ${
            state === 'enter' ? 'animate-scale-in' : 'animate-scale-out pointer-events-none'
          }`}
        >
          <div className="border-b border-navy-100 px-3 py-2 text-xs text-navy-400">
            <p className="font-medium text-navy">{user.name}</p>
            <p>{roleLabel(user.role)}</p>
            <p className="mt-1">@{user.username}</p>
          </div>
          <div className="p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              role="menuitem"
              onClick={handleOpenProfile}
            >
              Mi perfil
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              role="menuitem"
              onClick={requestLogout}
            >
              Cerrar sesión
            </Button>
          </div>
        </div>
      )}

      <ConfirmActionModal
        open={confirmLogout}
        title="Cerrar sesión"
        confirmLabel="Cerrar sesión"
        confirmVariant="danger"
        busy={isLoggingOut}
        onCancel={() => {
          if (!isLoggingOut) setConfirmLogout(false);
        }}
        onConfirm={() => {
          void handleLogout();
        }}
      >
        <p className="text-sm text-navy-700">
          ¿Desea cerrar la sesión de <strong>{user.name}</strong>?
        </p>
      </ConfirmActionModal>
    </div>
  );
}
