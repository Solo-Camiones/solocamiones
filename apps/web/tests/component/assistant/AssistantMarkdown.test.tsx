// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AssistantMarkdown } from '../../../src/features/assistant/AssistantMarkdown';
import '../../support/dom';

describe('AssistantMarkdown', () => {
  it('renders approved internal links and blocks external hrefs as text', () => {
    render(
      <MemoryRouter>
        <AssistantMarkdown content={'Ver [clientes](/customers) y [externo](https://evil.example)'} />
      </MemoryRouter>,
    );

    const internal = screen.getByRole('link', { name: 'clientes' });
    expect(internal).toHaveAttribute('href', '/customers');
    expect(screen.queryByRole('link', { name: 'externo' })).not.toBeInTheDocument();
    expect(screen.getByText('externo')).toBeVisible();
  });

  it('does not execute raw HTML', () => {
    const { container } = render(
      <MemoryRouter>
        <AssistantMarkdown content={'Hola <img src=x onerror="window.__xss=1" /> mundo'} />
      </MemoryRouter>,
    );

    expect(container.querySelector('img')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('renders GFM tables as HTML tables, including compacted single-line tables', () => {
    const compacted =
      '| Moneda | Balance | |---|---:| | DOP | 151,036.00 | | USD | 273.00 |';

    render(
      <MemoryRouter>
        <AssistantMarkdown content={compacted} />
      </MemoryRouter>,
    );

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Moneda' })).toBeVisible();
    expect(within(table).getByRole('cell', { name: 'DOP' })).toBeVisible();
    expect(within(table).getByRole('cell', { name: '151,036.00' })).toBeVisible();
    expect(within(table).getByRole('cell', { name: 'USD' })).toBeVisible();
  });

  it('formats ISO timestamps and calendar dates for display', () => {
    render(
      <MemoryRouter>
        <AssistantMarkdown content={'Corte: 2026-09-24T23:39:22.122Z\nVence: 2026-11-15'} />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/2026-09-24T23:39:22/)).not.toBeInTheDocument();
    expect(screen.getByText(/24 sept?\.? de 2026/i)).toBeVisible();
    expect(screen.getByText(/15 nov\.? de 2026/i)).toBeVisible();
  });
});
