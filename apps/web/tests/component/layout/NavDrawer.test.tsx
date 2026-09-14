// @vitest-environment jsdom

import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { COMMERCIAL_SIDEBAR_ID } from '../../../src/shared/layout/breakpoints';
import { NavDrawer } from '../../../src/shared/layout/NavDrawer';
import { renderWithProviders } from '../../support/render';
import '../../support/dom';

function DrawerHarness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir menú
      </button>
      <button type="button">Fuera del menú</button>
      <NavDrawer
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <aside id={COMMERCIAL_SIDEBAR_ID} tabIndex={-1}>
          <a href="/sales">Ventas</a>
        </aside>
      </NavDrawer>
    </>
  );
}

describe('NavDrawer', () => {
  it('closes on Escape after opening and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<DrawerHarness onClose={onClose} />);

    const trigger = screen.getByRole('button', { name: 'Abrir menú' });
    await user.click(trigger);

    expect(document.getElementById(COMMERCIAL_SIDEBAR_ID)).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
  });
});
