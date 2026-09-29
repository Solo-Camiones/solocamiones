import { BUSINESS_TIME_ZONE } from '../../shared/domain/business-date';

const ISO_DATE_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;

/** Calendar date not followed by a time designator or another digit. */
const ISO_DATE = /\d{4}-\d{2}-\d{2}(?!T|\d)/g;

/** True when the matched datetime already carries an explicit offset or Z. */
const HAS_EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-DO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: BUSINESS_TIME_ZONE,
});

/** Pure calendar dates — avoid UTC-midnight shifting into the previous local day. */
const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat('es-DO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Parses assistant ISO datetimes. Tool payloads use UTC (`toISOString`); models often
 * copy those strings and drop `Z`. ES5 treats offset-less `YYYY-MM-DDTHH:mm:ss` as
 * *local* time, which would show the UTC clock digits in AST (typically +4h wrong).
 * Offset-less values are therefore forced to UTC before formatting.
 */
function parseAssistantDateTime(iso: string): Date {
  const normalized = HAS_EXPLICIT_OFFSET.test(iso) ? iso : `${iso}Z`;
  return new Date(normalized);
}

/**
 * Rewrites ISO-8601 timestamps/dates in assistant Markdown into es-DO labels
 * (business timezone for datetimes; calendar-safe for date-only).
 */
export function formatAssistantTimestamps(content: string): string {
  return content
    .replace(ISO_DATE_TIME, (iso) => {
      const parsed = parseAssistantDateTime(iso);
      return Number.isNaN(parsed.getTime()) ? iso : DATE_TIME_FORMATTER.format(parsed);
    })
    .replace(ISO_DATE, (iso) => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (!match) return iso;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      return Number.isNaN(parsed.getTime()) ? iso : DATE_ONLY_FORMATTER.format(parsed);
    });
}
