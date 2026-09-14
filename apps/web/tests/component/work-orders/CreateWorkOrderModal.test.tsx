// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateWorkOrderModal } from '../../../src/features/work-orders/CreateWorkOrderModal';
import { renderWithProviders } from '../../support/render';
import { chooseSelectOption } from '../../support/select-menu';
import '../../support/dom';

const OPTIONS = {
  dismantlingPieces: [{ id: 'MOT-001', name: 'Detroit DD15 Completo', parentId: 'CAM-001' }],
  installationPieces: [{ id: 'ALT-010', name: 'Alternador independiente' }],
  destinations: [{ id: 'MOT-002', name: 'Motor incompleto' }],
  mechanics: [{ id: 'U-PEDRO', name: 'Pedro Santana' }],
};

describe('CreateWorkOrderModal', () => {
  it('submits a dismantling selection', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <CreateWorkOrderModal
        open
        options={OPTIONS}
        isSaving={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await chooseSelectOption(user, 'Pieza', 'MOT-001');
    await user.type(screen.getByLabelText('Notas'), 'Desarme de patio');
    await user.click(screen.getByRole('button', { name: 'Crear orden de trabajo' }));

    expect(onSubmit).toHaveBeenCalledWith({
      pieceId: 'MOT-001',
      type: 'DISMANTLING',
      destinationParentId: undefined,
      notes: 'Desarme de patio',
    });
  });

  it('requires a destination when creating an installation', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <CreateWorkOrderModal
        open
        options={OPTIONS}
        isSaving={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await chooseSelectOption(user, 'Tipo', 'INSTALLATION');
    await chooseSelectOption(user, 'Pieza', 'ALT-010');
    await chooseSelectOption(user, 'Padre destino', 'MOT-002');
    await user.click(screen.getByRole('button', { name: 'Crear orden de trabajo' }));

    expect(onSubmit).toHaveBeenCalledWith({
      pieceId: 'ALT-010',
      type: 'INSTALLATION',
      destinationParentId: 'MOT-002',
      notes: undefined,
    });
  });
});
