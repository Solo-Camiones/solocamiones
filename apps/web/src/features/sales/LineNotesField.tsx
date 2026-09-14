import { Field, Textarea } from '../../shared/ui';
import { LINE_NOTE_MAX_LENGTH, lineNotesFieldHint } from './line-notes';

type LineNotesFieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
};

export function LineNotesField({ id, value, onChange }: LineNotesFieldProps) {
  return (
    <div className="min-w-0 w-full max-w-full">
      <Field htmlFor={id} label="Nota" hint={lineNotesFieldHint(value.length)}>
        <Textarea
          id={id}
          rows={2}
          maxLength={LINE_NOTE_MAX_LENGTH}
          value={value}
          placeholder="Aclaración u otra información de esta línea"
          className="min-w-0 max-w-full resize-y overflow-x-hidden break-words"
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
    </div>
  );
}
