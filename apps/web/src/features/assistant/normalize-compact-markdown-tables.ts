/**
 * Some models emit GFM tables as a single line (header + separator + rows
 * joined with "| |"). remark-gfm only parses tables when each row is on its
 * own line — expand those compacted lines defensively.
 *
 * Only touches lines that already contain a GFM separator (`|---`) so normal
 * prose and well-formed multiline tables are left alone.
 */
export function normalizeCompactMarkdownTables(content: string): string {
  return content.replace(/^[^\n]*\|[^\n]*$/gm, (line) => {
    if (!/\|\s*:?-{3,}/.test(line)) {
      return line;
    }
    // "| |" with only whitespace between pipes marks a row boundary in
    // collapsed tables (empty cells are rare in assistant summaries).
    return line.replace(/\|\s+\|/g, '|\n|');
  });
}
