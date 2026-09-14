// @vitest-environment jsdom

import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button, Field, GuardedModal, Input } from '../../../src/shared/ui';
import { renderWithProviders } from '../../support/render';
import '../../support/dom';

function GuardedFormHarness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir formulario</Button>
      <GuardedModal
        open={open}
        title="Nuevo registro"
        hasUnsavedChanges={name !== ''}
        onClose={() => {
          onClose();
          setOpen(false);
          setName('');
        }}
      >
        {({ requestClose }) => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <Field label="Nombre" htmlFor="guarded-name">
              <Input
                id="guarded-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Button type="button" onClick={requestClose}>
              Cancelar
            </Button>
          </form>
        )}
      </GuardedModal>
    </>
  );
}

describe('GuardedModal', () => {
  it('closes immediately when there is nothing typed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<GuardedFormHarness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Abrir formulario' }));
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks before discarding typed fields from Escape, backdrop, or X', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<GuardedFormHarness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Abrir formulario' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Texto que no debe perderse');
    await user.keyboard('{Escape}');

    expect(within(dialog).getByRole('heading', { name: '¿Descartar los cambios?' })).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Texto que no debe perderse');

    await user.click(dialog.previousElementSibling!);
    expect(within(dialog).getByRole('heading', { name: '¿Descartar los cambios?' })).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));

    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    await user.click(within(dialog).getByRole('button', { name: 'Descartar' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
