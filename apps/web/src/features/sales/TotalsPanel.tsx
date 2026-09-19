import { useEffect, useState } from 'react';

import { money, Input } from '../../shared/ui';
import type { Currency } from '../../api/contracts/entities';
import type { PosDraftTotals } from '../../api/contracts/sales';

type TotalsPanelProps = {
  totals: PosDraftTotals;
  currency: Currency;
  discountPercent: number;
  readOnly?: boolean;
  disabled?: boolean;
  onDiscountPercentChange?: (discountPercent: number) => void;
};

function formatPercentInput(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(value);
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function TotalsPanel({
  totals,
  currency,
  discountPercent,
  readOnly = false,
  disabled = false,
  onDiscountPercentChange,
}: TotalsPanelProps) {
  const inputDisabled = readOnly || disabled || !onDiscountPercentChange;
  const [draftPercent, setDraftPercent] = useState(discountPercent);

  useEffect(() => {
    setDraftPercent(discountPercent);
  }, [discountPercent]);

  const commitPercent = () => {
    if (!onDiscountPercentChange) return;
    const next = clampPercent(Number.isFinite(draftPercent) ? draftPercent : 0);
    setDraftPercent(next);
    if (next !== discountPercent) {
      onDiscountPercentChange(next);
    }
  };

  return (
    <dl className="grid gap-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-navy-400">Líneas</dt>
        <dd className="font-medium text-navy">{totals.lineCount}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-navy-400">Subtotal</dt>
        <dd className="font-medium text-navy">{money(totals.taxableBase, currency)}</dd>
      </div>
      <div className="flex items-center justify-between gap-3">
        <dt className="flex min-w-0 flex-1 items-center gap-2 text-navy-400">
          <label htmlFor="pos-discount-percent" className="shrink-0">
            Descuento %
          </label>
          <Input
            id="pos-discount-percent"
            data-testid="pos-discount-percent"
            className="max-w-24"
            type="number"
            min={0}
            max={100}
            step="0.01"
            inputMode="decimal"
            aria-label="Porcentaje de descuento"
            value={formatPercentInput(draftPercent)}
            disabled={inputDisabled}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw.trim() === '') {
                setDraftPercent(0);
                return;
              }
              const parsed = Number(raw);
              if (!Number.isFinite(parsed)) return;
              setDraftPercent(clampPercent(parsed));
            }}
            onBlur={commitPercent}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
          />
        </dt>
        <dd className="font-medium text-navy" data-testid="pos-discount-amount">
          −{money(totals.discount, currency)}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-navy-400">ITBIS</dt>
        <dd className="font-medium text-navy" data-testid="pos-itbis">
          {money(totals.itbis, currency)}
        </dd>
      </div>
      <div className="flex justify-between border-t border-navy-100 pt-3 text-lg">
        <dt className="font-semibold text-navy">Total a cobrar</dt>
        <dd className="font-semibold text-navy" data-testid="pos-total">
          {money(totals.gross, currency)}
        </dd>
      </div>
    </dl>
  );
}
