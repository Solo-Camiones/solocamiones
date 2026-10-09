import { useState } from 'react';

import type { AppError } from '../../shared/auth/types';
import type { MechanicEvidenceKind } from '../../api/contracts/work-orders';
import { Button, Field, Input, Mono, SectionTitle } from '../../shared/ui';
import { toMechanicUserMessage } from './mechanic-copy';

export type EvidencePanelProps = {
  beforePhotos: string[];
  afterPhotos: string[];
  canAdd: boolean;
  disabled?: boolean;
  onAdd: (kind: MechanicEvidenceKind, fileName: string) => Promise<AppError | null>;
};

type SlotState =
  | { status: 'idle' }
  | { status: 'uploading'; fileName: string }
  | { status: 'failed'; fileName: string; error: AppError };

function PhotoList({ photos }: { photos: string[] }) {
  if (photos.length === 0) {
    return <p className="text-sm text-navy-400">Sin fotos todavía</p>;
  }

  return (
    <ul className="space-y-1 text-sm">
      {photos.map((photo, index) => (
        <li key={`${photo}-${index}`}>
          <Mono>{photo}</Mono>
        </li>
      ))}
    </ul>
  );
}

function EvidenceField({
  kind,
  label,
  photos,
  canAdd,
  disabled,
  onAdd,
}: {
  kind: MechanicEvidenceKind;
  label: string;
  photos: string[];
  canAdd: boolean;
  disabled?: boolean;
  onAdd: (kind: MechanicEvidenceKind, fileName: string) => Promise<AppError | null>;
}) {
  const fieldId = `evidence-${kind.toLowerCase()}`;
  const [slot, setSlot] = useState<SlotState>({ status: 'idle' });

  async function upload(fileName: string) {
    setSlot({ status: 'uploading', fileName });
    const error = await onAdd(kind, fileName);
    if (error) {
      setSlot({ status: 'failed', fileName, error });
      return;
    }
    setSlot({ status: 'idle' });
  }

  return (
    <div className="space-y-2">
      <Field
        label={label}
        htmlFor={fieldId}
        hint={
          canAdd
            ? 'Use la cámara o una foto del teléfono. Si falla la red, la foto queda lista para reintentar.'
            : undefined
        }
      >
        {canAdd ? (
          <Input
            id={fieldId}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={disabled || slot.status === 'uploading'}
            className="min-h-12 text-base"
            aria-busy={slot.status === 'uploading'}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void upload(file.name);
                event.target.value = '';
              }
            }}
          />
        ) : (
          <p className="text-sm text-navy-400">Solo el mecánico asignado puede cargar evidencia.</p>
        )}
      </Field>

      {slot.status === 'uploading' && (
        <div className="space-y-1" aria-live="polite">
          <p className="text-sm text-navy">Subiendo {slot.fileName}…</p>
          <progress className="h-2 w-full" aria-label={`Subiendo ${slot.fileName}`} />
        </div>
      )}

      {slot.status === 'failed' && (
        <div
          className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2"
          role="alert"
        >
          <p className="text-sm text-red-900">{toMechanicUserMessage(slot.error)}</p>
          <p className="text-sm text-navy">
            Foto pendiente: <Mono>{slot.fileName}</Mono>
          </p>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={disabled}
            onClick={() => void upload(slot.fileName)}
          >
            Reintentar subida
          </Button>
        </div>
      )}

      <PhotoList photos={photos} />
    </div>
  );
}

export function EvidencePanel({
  beforePhotos,
  afterPhotos,
  canAdd,
  disabled,
  onAdd,
}: EvidencePanelProps) {
  return (
    <section className="space-y-4">
      <SectionTitle
        title="Evidencia"
        subtitle="Completar exige al menos una foto de antes y una de después"
      />
      <EvidenceField
        kind="BEFORE"
        label="Antes"
        photos={beforePhotos}
        canAdd={canAdd}
        disabled={disabled}
        onAdd={onAdd}
      />
      <EvidenceField
        kind="AFTER"
        label="Después"
        photos={afterPhotos}
        canAdd={canAdd}
        disabled={disabled}
        onAdd={onAdd}
      />
    </section>
  );
}
