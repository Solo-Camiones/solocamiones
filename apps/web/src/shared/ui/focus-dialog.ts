const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Prefer a real field so Enter does not activate the close or a destructive
 * footer action as soon as the dialog opens.
 */
export function getInitialFocus(root: HTMLElement): HTMLElement {
  const explicit = root.querySelector<HTMLElement>('[data-autofocus], [autofocus]');
  if (explicit) {
    return explicit;
  }

  const firstField = root.querySelector<HTMLElement>(
    'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button[aria-haspopup="listbox"]:not([disabled])',
  );
  if (firstField) {
    return firstField;
  }

  return root;
}

export function trapTabKey(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== 'Tab') {
    return;
  }

  const focusable = getFocusableElements(root);
  const active = document.activeElement;

  if (focusable.length === 0) {
    event.preventDefault();
    root.focus();
    return;
  }

  if (!(active instanceof Node) || !root.contains(active)) {
    event.preventDefault();
    focusable[0]?.focus();
    return;
  }

  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;

  if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export function setBackgroundInert(dialogRoot: HTMLElement, inert: boolean): void {
  for (const child of Array.from(document.body.children)) {
    if (child === dialogRoot) {
      continue;
    }

    if (inert) {
      child.setAttribute('inert', '');
    } else {
      child.removeAttribute('inert');
    }
  }
}
