/**
 * Replace {{token}} placeholders using fixture map.
 * Unknown tokens are left as-is so scoring can surface them.
 */
export function substitutePlaceholders(
  template: string,
  placeholders: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = placeholders[key];
    return value ?? match;
  });
}

export function substitutePlaceholdersInUnknown(
  value: unknown,
  placeholders: Record<string, string>,
): unknown {
  if (typeof value === 'string') {
    return substitutePlaceholders(value, placeholders);
  }
  if (Array.isArray(value)) {
    return value.map((item) => substitutePlaceholdersInUnknown(item, placeholders));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = substitutePlaceholdersInUnknown(nested, placeholders);
    }
    return out;
  }
  return value;
}
