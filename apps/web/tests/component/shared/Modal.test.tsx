// @vitest-environment jsdom

import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button, Input, Modal } from '../../../src/shared/ui';
import { renderWithProviders } from '../../support/render';
import '../../support/dom';

function ModalHarness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir diálogo</Button>
      <Button>Fuera del diálogo</Button>
      <Modal
        open={open}
        title="Alta de cliente"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <Input id="modal-name" aria-label="Nombre" />
        <Button>Guardar</Button>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('traps tab, closes on Escape, and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<ModalHarness onClose={onClose} />);

    const trigger = screen.getByRole('button', { name: 'Abrir diálogo' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Alta de cliente' });
    expect(dialog).toBeVisible();
    expect(screen.getByLabelText('Nombre')).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Nombre')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('does not place initial focus on a destructive action', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderWithProviders(
      <Modal open title="Eliminar" onClose={vi.fn()}>
        <p>Esta acción no se puede deshacer.</p>
        <Button variant="danger" onClick={onDelete}>
          Eliminar definitivamente
        </Button>
      </Modal>,
    );

    expect(screen.getByRole('dialog', { name: 'Eliminar' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Eliminar definitivamente' })).not.toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('blocks every implicit close path when dismissal is disabled', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <Modal open title="Guardando" onClose={onClose} dismissible={false}>
        <p>Operación en curso</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Guardando' });
    const closeButton = within(dialog).getByRole('button', { name: 'Cerrar' });
    expect(closeButton).toBeDisabled();

    await user.keyboard('{Escape}');
    await user.click(dialog.previousElementSibling!);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toBeVisible();
  });
});
