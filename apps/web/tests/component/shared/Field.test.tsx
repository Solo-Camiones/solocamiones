// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Field, Input } from '../../../src/shared/ui';
import { renderWithProviders } from '../../support/render';
import '../../support/dom';

describe('Field', () => {
  it('associates hint, error, and invalid state with the nested control', () => {
    const { rerender } = renderWithProviders(
      <Field label="Nombre" htmlFor="field-name" hint="Como aparece en la factura">
        <div>
          <Input id="field-name" />
        </div>
      </Field>,
    );

    const input = screen.getByLabelText('Nombre');
    const hint = screen.getByText('Como aparece en la factura');
    expect(input).toHaveAttribute('aria-describedby', hint.id);
    expect(input).not.toHaveAttribute('aria-invalid');

    rerender(
      <Field
        label="Nombre"
        htmlFor="field-name"
        hint="Como aparece en la factura"
        error="Escriba el nombre comercial"
      >
        <div>
          <Input id="field-name" />
        </div>
      </Field>,
    );

    const error = screen.getByText('Escriba el nombre comercial');
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-describedby', error.id);
    expect(screen.queryByText('Como aparece en la factura')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveFocus();
  });
});
