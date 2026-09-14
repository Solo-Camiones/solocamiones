import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

function optionMatches(element: Element | null, option: string | RegExp): boolean {
  if (!element) {
    return false;
  }
  const value = element.getAttribute('data-value') ?? '';
  const label = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (typeof option === 'string') {
    return value === option || label === option;
  }
  return option.test(value) || option.test(label);
}

/** Opens a styled Select/SelectMenu and chooses by visible label or option value. */
export async function chooseSelectOption(
  user: UserEvent,
  label: string | RegExp,
  option: string | RegExp,
  container?: HTMLElement,
) {
  const queries = container ? within(container) : screen;
  const trigger = queries.getByLabelText(label);
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    await user.click(trigger);
  }
  const listbox = await screen.findByRole('listbox');
  await user.click(
    within(listbox).getByRole('option', {
      name: (_accessibleName, element) => optionMatches(element, option),
    }),
  );
}
