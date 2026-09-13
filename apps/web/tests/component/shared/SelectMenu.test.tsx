// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Field, SelectMenu } from '../../../src/shared/ui';
import { renderWithProviders } from '../../support/render';
import '../../support/dom';

function CustomerMenu() {
  const [value, setValue] = useState('cash');
  return (
    <Field htmlFor="customer" label="Cliente">
      <SelectMenu
        id="customer"
        value={value}
        searchable
        searchPlaceholder="Buscar cliente"
        options={[
          { value: 'cash', label: 'Cliente contado (predeterminado)' },
          { value: 'cesar', label: 'Cesar', description: '12365498745' },
          { value: 'lorena', label: 'Lorena Garcia', description: '40233198745' },
        ]}
        onChange={setValue}
      />
    </Field>
  );
}

function SimpleMenu() {
  const [value, setValue] = useState('cash');
  return (
    <Field htmlFor="payment" label="Pago">
      <SelectMenu
        id="payment"
        value={value}
        options={[
          { value: 'cash', label: 'Contado' },
          { value: 'card', label: 'Tarjeta' },
        ]}
        onChange={setValue}
      />
    </Field>
  );
}

describe('SelectMenu', () => {
  it('keeps the option list inside a styled panel and selects by click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomerMenu />);

    await user.click(screen.getByLabelText('Cliente'));
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeVisible();
    expect(listbox.closest('[data-select-overlay]')).toBeTruthy();
    expect(screen.getByLabelText('Cliente').closest('div')).not.toContainElement(listbox);
    expect(screen.getByRole('option', { name: /Lorena Garcia/ })).toHaveTextContent('40233198745');

    await user.click(screen.getByRole('option', { name: /Lorena Garcia/ }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cliente')).toHaveTextContent('Lorena Garcia');
  });

  it('filters long customer lists from the search field', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomerMenu />);

    await user.click(screen.getByLabelText('Cliente'));
    await user.type(screen.getByLabelText('Buscar cliente'), 'cesar');

    expect(screen.getByRole('option', { name: /Cesar/ })).toBeVisible();
    expect(screen.queryByRole('option', { name: /Lorena/ })).not.toBeInTheDocument();
  });

  it('closes with Escape from search and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomerMenu />);

    const trigger = screen.getByLabelText('Cliente');
    await user.click(trigger);
    const search = screen.getByLabelText('Buscar cliente');
    expect(search).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('moves the highlight with arrows and selects with Enter from search', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomerMenu />);

    await user.click(screen.getByLabelText('Cliente'));
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cliente')).toHaveTextContent('Cesar');
    expect(screen.getByLabelText('Cliente')).toHaveFocus();
  });

  it('focuses the listbox when there is no search field', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SimpleMenu />);

    await user.click(screen.getByLabelText('Pago'));
    expect(screen.getByRole('listbox')).toHaveFocus();

    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Pago')).toHaveTextContent('Tarjeta');
    expect(screen.getByLabelText('Pago')).toHaveFocus();
  });
});
