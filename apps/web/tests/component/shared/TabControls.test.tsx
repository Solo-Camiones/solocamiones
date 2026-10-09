// @vitest-environment jsdom

import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TabBar } from '../../../src/shared/layout/TabBar';
import { Tabs } from '../../../src/shared/layout/Tabs';
import { renderWithProviders } from '../../support/render';
import '../../support/dom';

function FilterHarness() {
  const [value, setValue] = useState<'ALL' | 'DRAFT'>('ALL');
  return (
    <TabBar
      aria-label="Estado de factura"
      tabs={[
        { id: 'ALL', label: 'Todas' },
        { id: 'DRAFT', label: 'Borrador' },
      ]}
      value={value}
      onChange={setValue}
    />
  );
}

function CatalogHarness() {
  const [value, setValue] = useState<'categories' | 'services'>('categories');
  return (
    <Tabs
      aria-label="Tipo de catálogo"
      tabs={[
        { id: 'categories', label: 'Categorías' },
        { id: 'services', label: 'Servicios' },
      ]}
      value={value}
      onChange={setValue}
      panels={{
        categories: <p>Lista de categorías</p>,
        services: <p>Lista de servicios</p>,
      }}
    />
  );
}

describe('TabBar', () => {
  it('filters with pressed buttons instead of tab roles', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FilterHarness />);

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    const draft = screen.getByRole('button', { name: 'Borrador' });
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(draft);
    expect(draft).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Tabs', () => {
  it('exposes a complete tablist and moves selection with arrow keys', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CatalogHarness />);

    const categories = screen.getByRole('tab', { name: 'Categorías' });
    const services = screen.getByRole('tab', { name: 'Servicios' });
    expect(categories).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Categorías' })).not.toHaveAttribute('hidden');
    const servicesPanel = screen
      .getAllByRole('tabpanel', { hidden: true })
      .find((panel) => panel.id.endsWith('services'));
    expect(servicesPanel).toHaveAttribute('hidden');

    categories.focus();
    await user.keyboard('{ArrowRight}');
    expect(services).toHaveAttribute('aria-selected', 'true');
    expect(services).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Servicios' })).not.toHaveAttribute('hidden');
  });
});
