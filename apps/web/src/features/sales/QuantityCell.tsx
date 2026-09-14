import type { LineType } from '../../api/contracts/entities';

const QUANTITY_STEP = 1;
const MIN_LINE_QUANTITY = 1;

const QUANTITY_EDITABLE_TYPES: ReadonlySet<LineType> = new Set(['QTY', 'GENERIC', 'EXTERNAL']);

export function posLineQuantityEditable(type: LineType): boolean {
  return QUANTITY_EDITABLE_TYPES.has(type);
}

type QuantityCellProps = {
  description: string;
  quantity: number;
  disabled: boolean;
  maxQuantity?: number;
  onChange: (quantity: number) => void;
};

export function QuantityCell({
  description,
  quantity,
  disabled,
  maxQuantity,
  onChange,
}: QuantityCellProps) {
  const canDecrease = quantity > MIN_LINE_QUANTITY;
  const canIncrease = maxQuantity == null || quantity + QUANTITY_STEP <= maxQuantity;

  return (
    <div
      role="group"
      aria-label={`Cantidad de ${description}`}
      className="inline-flex items-center gap-1.5"
    >
      <span className="min-w-6 text-center tabular-nums text-navy" aria-live="polite">
        {quantity}
      </span>
      <div className="inline-flex flex-col gap-0.5">
        <QuantityStepButton
          disabled={disabled || !canIncrease}
          aria-label={`Aumentar cantidad de ${description}`}
          onClick={() => onChange(quantity + QUANTITY_STEP)}
        >
          +
        </QuantityStepButton>
        <QuantityStepButton
          disabled={disabled || !canDecrease}
          aria-label={`Disminuir cantidad de ${description}`}
          onClick={() => onChange(quantity - QUANTITY_STEP)}
        >
          −
        </QuantityStepButton>
      </div>
    </div>
  );
}

function QuantityStepButton({
  disabled,
  'aria-label': ariaLabel,
  onClick,
  children,
}: {
  disabled: boolean;
  'aria-label': string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
      className="inline-flex h-5 w-5 items-center justify-center rounded border border-navy-200 bg-white text-xs font-semibold leading-none text-navy hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
