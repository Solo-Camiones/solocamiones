import { useId, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './Button';
import { getInitialFocus, setBackgroundInert, trapTabKey } from './focus-dialog';
import { XIcon } from './icons';

export type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: 'md' | 'lg';
  /** Sticky actions; the body remains the only scroll region. */
  footer?: ReactNode;
  /** Prevent Escape, backdrop, and close-button dismissal during a protected operation. */
  dismissible?: boolean;
};

const sizeClasses = {
  md: 'max-w-lg',
  lg: 'max-w-3xl',
};

export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  size = 'md',
  dismissible = true,
}: ModalProps) {
  // Unmount immediately on close so sequential dialogs (POS add → edit) cannot
  // overlap in the DOM. Enter animation still plays on mount.
  if (!open) {
    return null;
  }

  return (
    <ModalDialog
      title={title}
      size={size}
      footer={footer}
      onClose={onClose}
      dismissible={dismissible}
    >
      {children}
    </ModalDialog>
  );
}

/**
 * Portals the dialog to document.body so the rest of the page can be marked
 * inert. Without a portal, inert on #root would disable the dialog itself.
 */
function ModalDialog({
  title,
  children,
  footer,
  onClose,
  dismissible = true,
  size = 'md',
}: Omit<ModalProps, 'open'>) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  useLayoutEffect(() => {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) {
      return;
    }

    const dialogPanel = panel;
    setBackgroundInert(overlay, true);
    getInitialFocus(dialogPanel).focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (document.querySelector('[aria-haspopup="listbox"][aria-expanded="true"]')) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (dismissibleRef.current) {
          onCloseRef.current();
        }
        return;
      }

      trapTabKey(event, dialogPanel);
    }

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      setBackgroundInert(overlay, false);
      previouslyFocused.current?.focus();
    };
  }, []);

  function handleOverlayMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (dismissible && event.target === event.currentTarget) {
      onClose();
    }
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center overflow-y-auto bg-navy/50 p-3 sm:items-center sm:p-4"
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`my-auto flex max-h-[min(90dvh,calc(100dvh-1.5rem))] w-full min-w-0 animate-scale-in ${sizeClasses[size]} flex-col overflow-hidden rounded-xl bg-white shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-light/50`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-navy-100 px-4 py-3 sm:px-5 sm:py-4">
          <h2 id={titleId} className="min-w-0 text-lg font-semibold text-navy">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={onClose}
            aria-label="Cerrar"
            disabled={!dismissible}
          >
            <XIcon />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-navy-100 px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
