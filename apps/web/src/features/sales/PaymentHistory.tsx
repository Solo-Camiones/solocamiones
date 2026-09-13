import type { PaymentView } from '../../api/contracts/sales';
import type { Currency } from '../../api/contracts/entities';
import { Chip, Empty, money, SectionTitle } from '../../shared/ui';
import { PAYMENT_METHOD_LABELS } from './labels';

const DATE_FORMATTER = new Intl.DateTimeFormat('es-DO', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const EFFECTIVE_DATE_FORMATTER = new Intl.DateTimeFormat('es-DO', {
  timeZone: 'UTC',
  dateStyle: 'medium',
});

function effectiveDate(payment: PaymentView): Date {
  return new Date(payment.effectiveDate ? `${payment.effectiveDate}T00:00:00Z` : payment.createdAt);
}

export type PaymentHistoryProps = {
  payments: PaymentView[];
  currency: Currency;
};

export function PaymentHistory({ payments, currency }: PaymentHistoryProps) {
  const ordered = [...payments].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );

  return (
    <section>
      <SectionTitle
        title="Pagos y reembolsos"
        subtitle="Los pagos se registran uno a uno; no se editan recibos anteriores."
      />

      {ordered.length === 0 ? (
        <Empty
          title="Sin movimientos registrados"
          description="Esta factura no tiene pagos registrados."
        />
      ) : (
        <ul className="divide-y divide-navy-100 overflow-hidden rounded-xl border border-navy-100 bg-white">
          {ordered.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Chip tone={payment.kind === 'REFUND' ? 'danger' : 'success'}>
                    {payment.kind === 'REFUND' ? 'Reembolso' : 'Pago'}
                  </Chip>
                  <span className="text-sm text-navy">{PAYMENT_METHOD_LABELS[payment.method]}</span>
                </div>
                <p className="mt-0.5 text-xs text-navy-400">
                  Fecha efectiva: {EFFECTIVE_DATE_FORMATTER.format(effectiveDate(payment))}
                  {payment.recordedAt
                    ? ` · Registrado: ${DATE_FORMATTER.format(new Date(payment.recordedAt))}`
                    : ''}
                  {payment.actorName ? ` · por ${payment.actorName}` : ''}
                  {payment.reference ? ` · ${payment.reference}` : ''}
                </p>
              </div>
              <span className="font-mono text-sm text-navy">{money(payment.amount, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
