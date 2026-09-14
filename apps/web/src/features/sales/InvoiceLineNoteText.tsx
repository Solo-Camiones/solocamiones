export function InvoiceLineNoteText({ notes }: { notes?: string | null }) {
  if (!notes) {
    return null;
  }

  return (
    <p className="mt-0.5 min-w-0 max-w-full overflow-hidden break-all whitespace-pre-wrap text-xs leading-snug text-navy-400">
      {notes}
    </p>
  );
}
