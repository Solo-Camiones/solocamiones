import { Card } from '../../shared/ui';

export function PhotoGrid({ photos }: { photos: string[] }) {
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold text-navy">Fotos</h2>
      {photos.length === 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {['Principal', 'Lateral', 'Detalle'].map((label) => (
            <div
              key={label}
              className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-navy-200 bg-navy-50 text-xs text-navy-400"
            >
              {label}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <div
              key={`${photo}-${index}`}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg bg-navy-50 font-mono text-xs text-navy-400"
            >
              {index === 0 && (
                <span className="text-[10px] uppercase tracking-wide">Principal</span>
              )}
              {photo}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
