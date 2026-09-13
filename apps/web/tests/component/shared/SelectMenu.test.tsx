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

function DisabledMenu() {
  return (
    <Field htmlFor="disabled-payment" label="Pago deshabilitado">
      <SelectMenu
        id="disabled-payment"
        value="cash"
        disabled
        options={[
          { value: 'cash', label: 'Contado' },
          { value: 'card', label: 'Tarjeta' },
        ]}
        onChange={() => undefined}
      />
    </Field>
  );
}

function MenuWithDisabledOption() {
  const [value, setValue] = useState('cash');
  return (
    <Field htmlFor="payment-with-disabled-option" label="Forma de pago">
      <SelectMenu
        id="payment-with-disabled-option"
        value={value}
        options={[
          { value: 'cash', label: 'Contado' },
          { value: 'card', label: 'Tarjeta', disabled: true },
          { value: 'transfer', label: 'Transferencia' },
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

  it('shows the empty state when search has no matching options', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomerMenu />);

    await user.click(screen.getByLabelText('Cliente'));
    await user.type(screen.getByLabelText('Buscar cliente'), 'sin coincidencia posible');

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByText('Sin coincidencias')).toBeVisible();
  });

  it('does not open or receive focus when disabled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DisabledMenu />);

    const trigger = screen.getByLabelText('Pago deshabilitado');
    expect(trigger).toBeDisabled();

    await user.click(trigger);
    await user.tab();
    await user.keyboard(' ');

    expect(trigger).not.toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens with Space and focuses the listbox', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SimpleMenu />);

    const trigger = screen.getByLabelText('Pago');
    trigger.focus();
    await user.keyboard(' ');

    expect(screen.getByRole('listbox')).toBeVisible();
    expect(screen.getByRole('listbox')).toHaveFocus();
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

  it('closes with Escape from a menu without search and restores trigger focus', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SimpleMenu />);

    const trigger = screen.getByLabelText('Pago');
    await user.click(trigger);
    expect(screen.getByRole('listbox')).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('wraps at the ArrowUp and ArrowDown boundaries', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SimpleMenu />);

    const trigger = screen.getByLabelText('Pago');
    await user.click(trigger);
    await user.keyboard('{ArrowUp}{Enter}');
    expect(trigger).toHaveTextContent('Tarjeta');

    await user.click(trigger);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(trigger).toHaveTextContent('Contado');
  });

  it('selects the active option with Space', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SimpleMenu />);

    const trigger = screen.getByLabelText('Pago');
    await user.click(trigger);
    await user.keyboard('{ArrowDown} ');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Tarjeta');
    expect(trigger).toHaveFocus();
  });

  it('ignores a disabled option by click and skips it with keyboard navigation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MenuWithDisabledOption />);

    const trigger = screen.getByLabelText('Forma de pago');
    await user.click(trigger);
    const disabledOption = screen.getByRole('option', { name: 'Tarjeta' });
    expect(disabledOption).toBeDisabled();
    expect(disabledOption).toHaveAttribute('aria-disabled', 'true');

    await user.click(disabledOption);
    expect(screen.getByRole('listbox')).toBeVisible();
    expect(trigger).toHaveTextContent('Contado');

    screen.getByRole('listbox').focus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Transferencia');
    expect(trigger).toHaveFocus();
  });
});
