// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
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
});
