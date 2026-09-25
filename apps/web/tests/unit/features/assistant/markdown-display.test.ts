import { describe, expect, it } from 'vitest';

import { formatAssistantTimestamps } from '../../../../src/features/assistant/format-assistant-timestamps';
import { normalizeCompactMarkdownTables } from '../../../../src/features/assistant/normalize-compact-markdown-tables';

describe('normalizeCompactMarkdownTables', () => {
  it('expands a compacted GFM table into one row per line', () => {
    const input =
      '| Moneda | Facturado | |---|---:| | DOP | 155,036.00 | | USD | 400.00 |';
    const output = normalizeCompactMarkdownTables(input);

    expect(output).toBe(
      ['| Moneda | Facturado |', '|---|---:|', '| DOP | 155,036.00 |', '| USD | 400.00 |'].join(
        '\n',
      ),
    );
  });

  it('leaves well-formed multiline tables unchanged', () => {
    const input = ['| A | B |', '|---|---|', '| 1 | 2 |'].join('\n');
    expect(normalizeCompactMarkdownTables(input)).toBe(input);
  });
});

describe('formatAssistantTimestamps', () => {
  it('formats ISO datetimes in the business timezone', () => {
    // 23:39 UTC on Sep 24 → 19:39 in America/Santo_Domingo (UTC-4)
    const formatted = formatAssistantTimestamps('Corte: 2026-09-24T23:39:22.122Z');
    expect(formatted).toMatch(/24 sept?\.? de 2026/i);
    expect(formatted).toMatch(/7:39/i);
    expect(formatted).not.toContain('T23:39');
  });

  it('formats date-only values without shifting the calendar day', () => {
    expect(formatAssistantTimestamps('Vence: 2026-11-15')).toMatch(/15 nov\.? de 2026/i);
  });
});
