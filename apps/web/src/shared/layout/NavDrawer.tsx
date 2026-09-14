import { useEffect, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { setBackgroundInert, trapTabKey } from '../ui/focus-dialog';
import { useTransition } from '../ui/useTransition';
import { COMMERCIAL_SIDEBAR_ID } from './breakpoints';

export type NavDrawerProps = {
  open: boolean;
  children: ReactNode;
  onClose: () => void;
};

/**
 * Off-canvas commercial nav. Portaled so AppShell overflow clipping cannot
 * hide it; reuses the same tab-trap helpers as Modal.
 */
export function NavDrawer({ open, children, onClose }: NavDrawerProps) {
  const state = useTransition(open, 200);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) {
      return;
    }

    const dialogPanel = panel;
    setBackgroundInert(overlay, true);
    document.getElementById(COMMERCIAL_SIDEBAR_ID)?.focus({ preventScroll: true });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      trapTabKey(event, dialogPanel);
    }

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      setBackgroundInert(overlay, false);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      return;
    }
    previouslyFocused.current?.focus();
  }, [open]);

  if (state === 'unmounted') {
    return null;
  }

  function handleOverlayMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  const isEntering = state === 'enter';
  const pointerNoneWhileExiting = open ? '' : ' pointer-events-none';

  return createPortal(
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-40 flex bg-navy/50 ${
        isEntering ? 'animate-fade-in' : 'animate-fade-out'
      }${pointerNoneWhileExiting}`}
      aria-hidden={open ? undefined : true}
      inert={!open}
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        ref={panelRef}
        className={`h-full outline-none ${
          isEntering ? 'animate-slide-in-left' : 'animate-slide-out-left'
        }${pointerNoneWhileExiting}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
