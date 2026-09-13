// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { QuantityCell } from '../../../src/features/sales/QuantityCell';
import { renderWithProviders } from '../../support/render';
import '../../support/dom';

type NullableMaxQuantityProps = Omit<ComponentProps<typeof QuantityCell>, 'maxQuantity'> & {
  maxQuantity?: number | null;
};

function renderQuantityCell(overrides: Partial<NullableMaxQuantityProps> = {}) {
  const onChange = vi.fn();
  const props: NullableMaxQuantityProps = {
    description: 'Filtro de aceite',
    quantity: 2,
    disabled: false,
    onChange,
    ...overrides,
  };

  // Runtime intentionally treats null like an omitted maximum, while the production prop is narrower.
  renderWithProviders(<QuantityCell {...(props as ComponentProps<typeof QuantityCell>)} />);

  return { onChange };
}

describe('QuantityCell', () => {
  it('increments the quantity by one', async () => {
    const user = userEvent.setup();
    const { onChange } = renderQuantityCell();

    await user.click(screen.getByRole('button', { name: 'Aumentar cantidad de Filtro de aceite' }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('decrements the quantity by one', async () => {
    const user = userEvent.setup();
    const { onChange } = renderQuantityCell();

    await user.click(
      screen.getByRole('button', { name: 'Disminuir cantidad de Filtro de aceite' }),
    );

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('does not increment at the maximum quantity', async () => {
    const user = userEvent.setup();
    const { onChange } = renderQuantityCell({ quantity: 4, maxQuantity: 4 });
    const increase = screen.getByRole('button', {
      name: 'Aumentar cantidad de Filtro de aceite',
    });

    expect(increase).toBeDisabled();
    await user.click(increase);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not decrement below the minimum quantity', async () => {
    const user = userEvent.setup();
    const { onChange } = renderQuantityCell({ quantity: 1 });
    const decrease = screen.getByRole('button', {
      name: 'Disminuir cantidad de Filtro de aceite',
    });

    expect(decrease).toBeDisabled();
    await user.click(decrease);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('allows increments when maxQuantity is null', async () => {
    const user = userEvent.setup();
    const { onChange } = renderQuantityCell({ quantity: 10, maxQuantity: null });
    const increase = screen.getByRole('button', {
      name: 'Aumentar cantidad de Filtro de aceite',
    });

    expect(increase).toBeEnabled();
    await user.click(increase);

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(11);
  });

  it('disables both controls without calling onChange', async () => {
    const user = userEvent.setup();
    const { onChange } = renderQuantityCell({ disabled: true });
    const increase = screen.getByRole('button', {
      name: 'Aumentar cantidad de Filtro de aceite',
    });
    const decrease = screen.getByRole('button', {
      name: 'Disminuir cantidad de Filtro de aceite',
    });

    expect(increase).toBeDisabled();
    expect(decrease).toBeDisabled();

    await user.click(increase);
    await user.click(decrease);

    expect(onChange).not.toHaveBeenCalled();
  });
});
