import { Link } from 'react-router-dom';

import type { RecentInvoiceRow } from '../../api/contracts/dashboard';
import { Chip, Empty, money, Mono, SectionTitle } from '../../shared/ui';

function paymentTone(state: RecentInvoiceRow['paymentState']) {
  switch (state) {
    case 'PAID':
      return 'success' as const;
    case 'PAID_LATE':
      return 'amber' as const;
    case 'PENDING':
      return 'amber' as const;
    case 'OVERDUE':
    case 'CANCELLED':
      return 'danger' as const;
    case 'PARTIALLY_PAID':
      return 'amber' as const;
    case 'UNPAID':
      return 'danger' as const;
  }
}

function paymentLabel(state: RecentInvoiceRow['paymentState']) {
  switch (state) {
    case 'PAID':
      return 'Pagada';
    case 'PAID_LATE':
      return 'Pagada con retraso';
    case 'PENDING':
      return 'Pendiente';
    case 'OVERDUE':
      return 'Vencida';
    case 'CANCELLED':
      return 'Cancelada';
    case 'PARTIALLY_PAID':
      return 'Parcial';
    case 'UNPAID':
      return 'Sin pagar';
  }
}

export type RecentInvoicesListProps = {
  invoices: RecentInvoiceRow[];
};

export function RecentInvoicesList({ invoices }: RecentInvoicesListProps) {
  return (
    <section>
      <SectionTitle
        title="Facturas recientes"
        subtitle="Completadas, de la más reciente a la más antigua"
      />

      {invoices.length === 0 ? (
        <Empty title="No hay facturas completadas" />
      ) : (
        <ul className="divide-y divide-navy-100 overflow-hidden rounded-xl border border-navy-100 bg-white">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link
                to={`/sales/${invoice.id}`}
                className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-navy-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Mono className="font-semibold text-navy">{invoice.number}</Mono>
                  <p className="mt-0.5 text-sm text-navy-400">{invoice.customerName}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Chip tone={paymentTone(invoice.paymentState)}>
                    {paymentLabel(invoice.paymentState)}
                  </Chip>
                  <span className="font-mono text-sm text-navy">
                    {money(invoice.total, invoice.currency)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
