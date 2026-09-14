export const LINE_NOTE_MAX_LENGTH = 100;

export function normalizeLineNotes(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export function lineNotesFieldHint(length: number): string {
  return `Opcional · ${length}/${LINE_NOTE_MAX_LENGTH}`;
}
