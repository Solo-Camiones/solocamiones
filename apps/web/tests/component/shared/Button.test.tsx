// @vitest-environment jsdom

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from '../../../src/shared/ui';
import { renderWithProviders } from '../../support/render';
import '../../support/dom';

describe('Button', () => {
  it('disables and marks itself busy when busy is set', () => {
    renderWithProviders(<Button busy>Guardar</Button>);

    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('stays enabled when busy is not set', () => {
    renderWithProviders(<Button>Guardar</Button>);

    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });
});
