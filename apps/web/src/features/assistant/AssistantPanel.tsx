import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '../../shared/ui';
import { getInitialFocus, setBackgroundInert, trapTabKey } from '../../shared/ui/focus-dialog';
import { XIcon } from '../../shared/ui/icons';
import { useMediaQuery } from '../../shared/layout/useMediaQuery';
import { useTransition } from '../../shared/ui/useTransition';

import { AssistantComposer } from './AssistantComposer';
import { AssistantConversationList } from './AssistantConversationList';
import { AssistantMessageList } from './AssistantMessageList';
import { ASSISTANT_PANEL_MOBILE_MAX_WIDTH_PX } from './constants';
import { useAssistant } from './AssistantProvider';

const ASSISTANT_PANEL_ID = 'assistant-panel';

export function AssistantPanel() {
  const { open, closePanel, panelError } = useAssistant();
  const isMobile = useMediaQuery(
    `(max-width: ${ASSISTANT_PANEL_MOBILE_MAX_WIDTH_PX - 1}px)`,
    false,
  );
  const state = useTransition(open, 200);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const closeRef = useRef(closePanel);
  closeRef.current = closePanel;

  useLayoutEffect(() => {
    if (!open) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;

    const dialogPanel = panel;
    setBackgroundInert(overlay, true);
    getInitialFocus(dialogPanel).focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
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
    if (open) return;
    previouslyFocused.current?.focus();
  }, [open]);

  if (state === 'unmounted') {
    return null;
  }

  const isEntering = state === 'enter';

  return createPortal(
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-50 flex justify-end ${
        isEntering ? 'animate-fade-in' : 'animate-fade-out'
      }${open ? '' : ' pointer-events-none'}`}
      aria-hidden={open ? undefined : true}
    >
      <button
        type="button"
        className="absolute inset-0 appearance-none border-0 bg-navy/40 p-0"
        aria-label="Cerrar asistente"
        onClick={closePanel}
      />
      <section
        ref={panelRef}
        id={ASSISTANT_PANEL_ID}
        role="dialog"
        aria-modal="true"
        aria-label="Asistente"
        tabIndex={-1}
        className={`relative flex h-full flex-col bg-white shadow-xl outline-none ${
          isMobile ? 'w-full' : 'w-full max-w-3xl'
        } ${isEntering ? 'animate-slide-in-right' : 'animate-slide-out-right'}`}
      >
        <header className="flex items-center justify-between gap-2 border-b border-navy-100 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-navy">Asistente</h2>
            <p className="text-xs text-navy-400">Solo lectura · Administrator</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Cerrar" onClick={closePanel}>
            <XIcon />
          </Button>
        </header>

        {panelError ? (
          <p className="bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
            {panelError.message}
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1">
          {!isMobile ? <AssistantConversationList /> : null}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {isMobile ? (
              <div className="max-h-40 shrink-0 overflow-y-auto border-b border-navy-100">
                <AssistantConversationList />
              </div>
            ) : null}
            <AssistantMessageList />
            <AssistantComposer />
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export { ASSISTANT_PANEL_ID };
