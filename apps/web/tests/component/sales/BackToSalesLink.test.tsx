// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { BackToSalesLink } from '../../../src/features/sales/BackToSalesLink';
import '../../support/dom';

function renderBackStack(initialEntries: string[], initialIndex: number) {
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <Routes>
        <Route path="/profitability" element={<p>Rentabilidad</p>} />
        <Route path="/sales" element={<p>Ventas y Facturas</p>} />
        <Route
          path="/sales/:id"
          element={
            <>
              <BackToSalesLink />
              <p>Detalle de factura</p>
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BackToSalesLink', () => {
  it('returns to the previous in-app screen instead of always sales', async () => {
    const user = userEvent.setup();
    renderBackStack(['/profitability', '/sales/INV-1'], 1);

    expect(screen.getByText('Detalle de factura')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Volver atrás' }));

    expect(screen.getByText('Rentabilidad')).toBeVisible();
    expect(screen.queryByText('Ventas y Facturas')).not.toBeInTheDocument();
  });

  it('falls back to sales when there is no in-app history', async () => {
    const user = userEvent.setup();
    renderBackStack(['/sales/INV-1'], 0);

    await user.click(screen.getByRole('button', { name: 'Volver atrás' }));

    expect(screen.getByText('Ventas y Facturas')).toBeVisible();
  });
});
