// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CustomerFormModal } from '../../../src/features/customers/CustomerFormModal';
import { createAuthValue, renderWithProviders } from '../../support/render';
import { chooseSelectOption } from '../../support/select-menu';
import '../../support/dom';

function renderModal(
  props: Omit<ComponentProps<typeof CustomerFormModal>, 'canManageCredit'> & {
    role?: 'ADMINISTRATOR' | 'SELLER';
  },
) {
  const { role = 'SELLER', ...modalProps } = props;
  return renderWithProviders(<CustomerFormModal canManageCredit={role === 'ADMINISTRATOR'} {...modalProps} />, {
    auth: createAuthValue(role),
  });
}

describe('CustomerFormModal', () => {
  it('collects all fields for a new customer', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderModal({
      open: true,
      customer: null,
      isSaving: false,
      error: null,
      onClose: vi.fn(),
      onSubmit,
    });

    await user.type(screen.getByLabelText('Nombre'), 'Flota Este');
    await user.type(screen.getByLabelText('Identificación fiscal / cédula'), '131000001');
    await user.type(screen.getByLabelText('Dirección'), 'Santo Domingo');
    await user.type(screen.getByLabelText('Notas'), 'Cliente nuevo');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Revisa los datos antes de crear el cliente.')).toBeVisible();
    expect(screen.getByText('131000001')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Confirmar creación' }));

    expect(onSubmit).toHaveBeenCalledWith({
      id: undefined,
      name: 'Flota Este',
      rnc: '131000001',
      address: 'Santo Domingo',
      notes: 'Cliente nuevo',
      contacts: [],
    });
  });

  it('submits two contacts from the dynamic list', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderModal({
      open: true,
      customer: null,
      isSaving: false,
      error: null,
      onClose: vi.fn(),
      onSubmit,
    });

    await user.type(screen.getByLabelText('Nombre'), 'Flota Este');
    await user.click(screen.getByRole('button', { name: 'Agregar contacto' }));
    await user.click(screen.getByRole('button', { name: 'Agregar contacto' }));

    const names = screen.getAllByLabelText('Nombre del contacto');
    const phones = screen.getAllByLabelText('Teléfono');
    const emails = screen.getAllByLabelText('Correo');
    const titles = screen.getAllByLabelText('Cargo');

    await user.type(names[0]!, 'María Reyes');
    await user.type(phones[0]!, '809-555-0100');
    await user.type(emails[0]!, 'maria@example.com');
    await user.type(titles[0]!, 'Compras');
    await user.type(names[1]!, 'Carlos Peña');
    await user.type(phones[1]!, '809-555-0101');

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Contacto 1')).toBeVisible();
    expect(screen.getByText('María Reyes')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Confirmar creación' }));

    expect(onSubmit).toHaveBeenCalledWith({
      id: undefined,
      name: 'Flota Este',
      rnc: '',
      address: '',
      notes: '',
      contacts: [
        {
          id: undefined,
          name: 'María Reyes',
          phone: '809-555-0100',
          email: 'maria@example.com',
          title: 'Compras',
          isPrimary: true,
        },
        {
          id: undefined,
          name: 'Carlos Peña',
          phone: '809-555-0101',
          email: '',
          title: '',
          isPrimary: undefined,
        },
      ],
    });
  });

  it('prefills an edit and displays save errors inside the dialog', () => {
    renderModal({
      open: true,
      customer: { id: 'C1', name: 'Transportes del Caribe', customerType: 'CASH', contacts: [] },
      isSaving: false,
      error: 'Ya existe un cliente con esta identificación fiscal / cédula.',
      fieldErrors: {
        rnc: 'Ya existe un cliente con esta identificación fiscal / cédula.',
      },
      onClose: vi.fn(),
      onSubmit: vi.fn(),
    });

    expect(screen.getByRole('dialog', { name: 'Editar cliente' })).toBeVisible();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Transportes del Caribe');
    expect(
      screen.getAllByText('Ya existe un cliente con esta identificación fiscal / cédula.').length,
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText('Identificación fiscal / cédula')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('clears indexed contact errors when removing a contact', async () => {
    const user = userEvent.setup();
    renderModal({
      open: true,
      customer: {
        id: 'C1',
        name: 'Transportes del Caribe',
        customerType: 'CASH',
        contacts: [
          { id: 'CT1', phone: '', email: '' },
          { id: 'CT2', phone: '809-555-0100' },
        ],
      },
      isSaving: false,
      error: 'Cada contacto debe tener teléfono o correo.',
      fieldErrors: {
        'contacts.0': 'Cada contacto debe tener teléfono o correo.',
      },
      onClose: vi.fn(),
      onSubmit: vi.fn(),
    });

    expect(screen.getAllByText('Cada contacto debe tener teléfono o correo.')).not.toHaveLength(0);

    await user.click(screen.getAllByRole('button', { name: 'Quitar' })[0]!);

    expect(screen.getAllByText('Cada contacto debe tener teléfono o correo.')).toHaveLength(1);
    expect(screen.getByLabelText('Teléfono')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('asks before discarding typed customer data', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({
      open: true,
      customer: null,
      isSaving: false,
      error: null,
      onClose,
      onSubmit: vi.fn(),
    });

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Flota que no debe perderse');
    await user.keyboard('{Escape}');

    expect(within(dialog).getByRole('heading', { name: '¿Descartar los cambios?' })).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Flota que no debe perderse');
  });

  it('returns to the form from review without submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderModal({
      open: true,
      customer: null,
      isSaving: false,
      error: null,
      onClose: vi.fn(),
      onSubmit,
    });

    await user.type(screen.getByLabelText('Nombre'), 'Flota Este');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Volver a editar' }));

    expect(screen.getByLabelText('Nombre')).toHaveValue('Flota Este');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows customer type to administrators', () => {
    renderModal({
      open: true,
      customer: null,
      role: 'ADMINISTRATOR',
      isSaving: false,
      error: null,
      onClose: vi.fn(),
      onSubmit: vi.fn(),
    });

    expect(screen.getByLabelText('Tipo de cliente')).toBeVisible();
    expect(screen.queryByLabelText('Límite de crédito (DOP)')).not.toBeInTheDocument();
  });

  it('hides credit controls for sellers', () => {
    renderModal({
      open: true,
      customer: null,
      role: 'SELLER',
      isSaving: false,
      error: null,
      onClose: vi.fn(),
      onSubmit: vi.fn(),
    });

    expect(screen.queryByLabelText('Tipo de cliente')).not.toBeInTheDocument();
  });

  it('submits CREDIT limit and term for administrators', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderModal({
      open: true,
      customer: null,
      role: 'ADMINISTRATOR',
      isSaving: false,
      error: null,
      onClose: vi.fn(),
      onSubmit,
    });

    await user.type(screen.getByLabelText('Nombre'), 'Flota Crédito');
    await chooseSelectOption(user, 'Tipo de cliente', 'Crédito');
    await user.type(screen.getByLabelText('Límite de crédito (DOP)'), '10000.00');
    await chooseSelectOption(user, 'Plazo de crédito (días)', '60 días');
    await user.type(screen.getByLabelText('Identificación fiscal / cédula'), '131000001');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar creación' }));

    expect(onSubmit).toHaveBeenCalledWith({
      id: undefined,
      name: 'Flota Crédito',
      customerType: 'CREDIT',
      creditLimitDop: '10000.00',
      creditTermDays: 60,
      rnc: '131000001',
      address: '',
      notes: '',
      contacts: [],
    });
  });
});
