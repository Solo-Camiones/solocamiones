import { createHash } from 'node:crypto';

const UTF8_BYTE_ORDER_MARK = /^\uFEFF/;
const WINDOWS_OR_CLASSIC_MAC_LINE_ENDING = /\r\n?/g;

/**
 * Removes checkout-dependent differences (BOM, CRLF from Git on Windows) so the
 * same approved text yields the same checksum on every machine.
 */
export function normalizeKnowledgeContent(rawContent: string): string {
  return rawContent
    .replace(UTF8_BYTE_ORDER_MARK, '')
    .replace(WINDOWS_OR_CLASSIC_MAC_LINE_ENDING, '\n');
}

export function computeKnowledgeSha256(rawContent: string): string {
  return createHash('sha256').update(normalizeKnowledgeContent(rawContent), 'utf8').digest('hex');
}
