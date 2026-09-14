import { money } from '../../shared/ui';
import type { Currency } from '../../api/contracts/entities';
import type { PosDraftTotals } from '../../api/contracts/sales';

type TotalsPanelProps = {
  totals: PosDraftTotals;
  currency: Currency;
};

export function TotalsPanel({ totals, currency }: TotalsPanelProps) {
  return (
    <dl className="grid gap-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-navy-400">Líneas</dt>
        <dd className="font-medium text-navy">{totals.lineCount}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-navy-400">Base</dt>
        <dd className="font-medium text-navy">{money(totals.taxableBase, currency)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-navy-400">ITBIS incluido</dt>
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
