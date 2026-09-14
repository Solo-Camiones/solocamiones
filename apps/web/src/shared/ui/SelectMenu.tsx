import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { mergeDescribedBy, useFieldControl } from './field-context';
import { ChevronDownIcon } from './icons';

export type SelectMenuOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type SelectMenuProps = {
  id?: string;
  value: string;
  options: SelectMenuOption[];
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  onChange: (value: string) => void;
  className?: string;
  'data-pos-field'?: string;
};

/** Gap between the trigger and the overlay panel. */
const PANEL_GAP_PX = 4;
/** Above Modal overlay (`z-50`) so lists remain visible inside dialogs. */
const PANEL_Z_INDEX = 70;
const VIEWPORT_PADDING_PX = 8;
/** Matches Tailwind `max-h-56` (14rem). */
const PANEL_MAX_HEIGHT_PX = 224;
const MIN_SPACE_TO_OPEN_BELOW_PX = 180;

function optionMatchesQuery(option: SelectMenuOption, query: string): boolean {
  if (query === '') {
    return true;
  }
  const haystack = `${option.label} ${option.description ?? ''}`.toLowerCase();
  return haystack.includes(query);
}

function overlayStyleForTrigger(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING_PX;
  const spaceAbove = rect.top - VIEWPORT_PADDING_PX;
  const openUpward = spaceBelow < MIN_SPACE_TO_OPEN_BELOW_PX && spaceAbove > spaceBelow;
  const available = openUpward ? spaceAbove - PANEL_GAP_PX : spaceBelow - PANEL_GAP_PX;
  const left = Math.max(
    VIEWPORT_PADDING_PX,
    Math.min(rect.left, window.innerWidth - rect.width - VIEWPORT_PADDING_PX),
  );

  return {
    position: 'fixed',
    left,
    width: rect.width,
    zIndex: PANEL_Z_INDEX,
    maxHeight: Math.max(0, Math.min(PANEL_MAX_HEIGHT_PX, available)),
    top: openUpward ? undefined : rect.bottom + PANEL_GAP_PX,
    bottom: openUpward ? window.innerHeight - rect.top + PANEL_GAP_PX : undefined,
  };
}

export function SelectMenu({
  id,
  value,
  options,
  disabled = false,
  required = false,
  searchable = false,
  searchPlaceholder = 'Buscar',
  emptyMessage = 'Sin coincidencias',
  onChange,
  className = '',
  'data-pos-field': dataPosField,
}: SelectMenuProps) {
  const field = useFieldControl();
  const generatedListId = useId();
  const controlId = id ?? field?.controlId;
  const listId = `${controlId ?? generatedListId}-list`;
  const searchId = `${controlId ?? generatedListId}-search`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>();

  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return options.filter((option) => optionMatchesQuery(option, normalized));
  }, [options, query]);

  const activeOption = filtered[activeIndex];

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    function syncPosition() {
      const trigger = triggerRef.current;
      if (trigger) {
        setPanelStyle(overlayStyleForTrigger(trigger));
      }
    }

    syncPosition();
    window.addEventListener('resize', syncPosition);
    // Capture scroll from nested overflow containers (modals, main, tables).
    window.addEventListener('scroll', syncPosition, true);
    return () => {
      window.removeEventListener('resize', syncPosition);
      window.removeEventListener('scroll', syncPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setQuery('');
      setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
      if (searchable) {
        searchRef.current?.focus();
      } else {
        listRef.current?.focus();
      }
    }
    wasOpenRef.current = open;
  }, [open, options, searchable, value]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function openMenu() {
    const trigger = triggerRef.current;
    if (trigger) {
      setPanelStyle(overlayStyleForTrigger(trigger));
    }
    setOpen(true);
  }

  function choose(nextValue: string, optionDisabled?: boolean) {
    if (optionDisabled) {
      return;
    }
    onChange(nextValue);
    close();
  }

  function moveActive(delta: number) {
    if (filtered.length === 0) {
      return;
    }
    let next = activeIndex;
    for (let step = 0; step < filtered.length; step += 1) {
      next = (next + delta + filtered.length) % filtered.length;
      if (!filtered[next]?.disabled) {
        setActiveIndex(next);
        return;
      }
    }
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }
    if (open && event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu();
    }
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    const selectsActiveOption =
      event.key === 'Enter' || (event.key === ' ' && event.currentTarget === listRef.current);
    if (selectsActiveOption && activeOption && !activeOption.disabled) {
      event.preventDefault();
      choose(activeOption.value);
    }
  }

  const invalid = field?.invalid;
  const borderClass = invalid
    ? 'border-red-400 focus:border-red-500 focus:ring-red-300/30'
    : 'border-navy-200 focus:border-brand focus:ring-brand-light/30';

  const panel =
    open && panelStyle
      ? createPortal(
          <div
            ref={panelRef}
            data-select-overlay=""
            style={panelStyle}
            className="flex flex-col overflow-hidden rounded-xl border border-navy-100 bg-white shadow-lg"
          >
            {searchable && (
              <div className="shrink-0 border-b border-navy-100 p-2">
                <input
                  ref={searchRef}
                  id={searchId}
                  type="search"
                  onKeyDown={onPanelKeyDown}
                  value={query}
                  placeholder={searchPlaceholder}
                  autoComplete="off"
                  aria-label={searchPlaceholder}
                  className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy placeholder:text-navy-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light/30"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                />
              </div>
            )}
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-labelledby={controlId}
              tabIndex={-1}
              className="min-h-0 flex-1 overflow-y-auto py-1"
              onKeyDown={onPanelKeyDown}
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-navy-400">{emptyMessage}</li>
              ) : (
                filtered.map((option, index) => {
                  const isSelected = option.value === value;
                  const isActive = index === activeIndex;
                  return (
                    <li key={`${option.value}:${option.label}`} role="presentation">
                      <button
                        type="button"
                        role="option"
                        data-value={option.value}
                        aria-selected={isSelected}
                        aria-disabled={option.disabled || undefined}
                        disabled={option.disabled}
                        className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                          isActive ? 'bg-navy-50' : ''
                        } ${isSelected ? 'font-medium text-navy' : 'text-navy'}`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => choose(option.value, option.disabled)}
                      >
                        <span className="w-full truncate">{option.label}</span>
                        {option.description ? (
                          <span className="w-full truncate text-xs text-navy-400">{option.description}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={className}>
      <button
        ref={triggerRef}
        type="button"
        id={controlId}
        data-pos-field={dataPosField}
        data-value={value}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        aria-describedby={mergeDescribedBy(field?.describedBy)}
        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${borderClass}`}
        onClick={() => {
          if (disabled) {
            return;
          }
          if (open) {
            close();
            return;
          }
          openMenu();
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selected?.label ?? 'Seleccione'}
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-navy-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {panel}
    </div>
  );
}
