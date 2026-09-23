import { describe, expect, it } from 'vitest';

import {
  computeKnowledgeSha256,
  normalizeKnowledgeContent,
} from '../../../src/features/assistant/knowledge-checksum.js';

describe('knowledge checksum', () => {
  it('produces the same digest for LF, CRLF, and BOM-prefixed checkouts', () => {
    const linux = '# Guía\n\nLínea uno\nLínea dos\n';
    const windows = '# Guía\r\n\r\nLínea uno\r\nLínea dos\r\n';
    const withBom = `\uFEFF${windows}`;

    expect(computeKnowledgeSha256(windows)).toBe(computeKnowledgeSha256(linux));
    expect(computeKnowledgeSha256(withBom)).toBe(computeKnowledgeSha256(linux));
    expect(computeKnowledgeSha256(linux)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when the approved text changes', () => {
    expect(computeKnowledgeSha256('Plazo 30 días\n')).not.toBe(
      computeKnowledgeSha256('Plazo 45 días\n'),
    );
  });

  it('normalizes classic Mac line endings too', () => {
    expect(normalizeKnowledgeContent('a\rb\r\nc')).toBe('a\nb\nc');
  });
});
