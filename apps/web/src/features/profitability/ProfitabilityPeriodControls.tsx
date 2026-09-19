import { Input, Select } from '../../shared/ui';
import { formatDateRange, PERIOD_PRESETS, type DateRange, type PeriodPreset } from './period';

type ProfitabilityPeriodControlsProps = {
  preset: PeriodPreset;
  customFrom: string;
  customTo: string;
  resolvedRange: DateRange;
  onPresetChange: (preset: PeriodPreset) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
};

export function ProfitabilityPeriodControls({
  preset,
  customFrom,
  customTo,
  resolvedRange,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
}: ProfitabilityPeriodControlsProps) {
  return (
    <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
      <div className="flex min-w-0 items-center gap-2">
        <label htmlFor="profitability-period" className="shrink-0 text-sm text-navy-400">
          Período
        </label>
        <Select
          id="profitability-period"
          className="w-44 sm:w-52"
          value={preset}
          onChange={(event) => onPresetChange(event.target.value as PeriodPreset)}
        >
          {PERIOD_PRESETS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      {preset !== 'custom' ? (
        <span className="text-right text-xs text-navy-400" aria-label="Rango de fechas del período seleccionado">
          {formatDateRange(resolvedRange.from, resolvedRange.to)}
        </span>
      ) : null}
      {preset === 'custom' ? (
        <div className="grid grid-cols-2 gap-2 sm:w-[17.5rem]">
          <div className="min-w-0">
            <label htmlFor="profitability-from" className="sr-only">
              Desde
            </label>
            <Input
              id="profitability-from"
              type="date"
              value={customFrom}
              onChange={(event) => onCustomFromChange(event.target.value)}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="profitability-to" className="sr-only">
              Hasta
            </label>
            <Input
              id="profitability-to"
              type="date"
              value={customTo}
              onChange={(event) => onCustomToChange(event.target.value)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
