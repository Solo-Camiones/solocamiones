import type { CustomerOutstandingRow, SalesListRow } from '../../api/contracts/sales';
import { PaymentChip } from '../../shared/domain';
import { Empty, EntityLink, HoverRow, money, Mono, TableShell } from '../../shared/ui';

function formatDueDate(value?: string): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatIssuedDate(value?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function CustomerOutstandingTable({
  rows,
  hasQuery = false,
}: {
  rows: CustomerOutstandingRow[];
  hasQuery?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Empty
        title={hasQuery ? 'Sin resultados' : 'No hay saldos abiertos'}
        description={
          hasQuery
            ? 'Pruebe otro cliente o número de factura.'
            : 'Las facturas completadas con saldo pendiente aparecerán agrupadas por cliente y moneda.'
        }
      />
    );
  }

  // Totals grouped by currency — mixing currencies would produce meaningless sums.
  const totalsByCurrency = rows.reduce<
    Map<CustomerOutstandingRow['currency'], { invoiced: number; paid: number; balance: number; invoiceCount: number }>
  >((acc, row) => {
    const entry = acc.get(row.currency) ?? { invoiced: 0, paid: 0, balance: 0, invoiceCount: 0 };
    entry.invoiced += row.invoiced;
    entry.paid += row.paid;
    entry.balance += row.balance;
    entry.invoiceCount += row.invoiceCount;
    acc.set(row.currency, entry);
    return acc;
  }, new Map());

  // A single row is already its own total — no footer needed.
  const showTotals = rows.length > 1;

  return (
    <TableShell>
      <thead className="border-b border-navy-100 bg-navy-50 text-navy-400">
        <tr>
          <th className="px-4 py-3 font-medium">Cliente</th>
          <th className="px-4 py-3 font-medium">Moneda</th>
          <th className="px-4 py-3 font-medium text-right">Facturas</th>
          <th className="px-4 py-3 font-medium text-right">Facturado</th>
          <th className="px-4 py-3 font-medium text-right">Cobrado</th>
          <th className="px-4 py-3 font-medium text-right">Saldo</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-navy-100">
        {rows.map((row) => (
          <tr key={`${row.customerId}:${row.currency}`} className="text-sm text-navy">
            <td className="px-4 py-3 font-medium">{row.customerName}</td>
            <td className="px-4 py-3">{row.currency}</td>
            <td className="px-4 py-3 text-right font-mono">{row.invoiceCount}</td>
            <td className="px-4 py-3 text-right font-mono">{money(row.invoiced, row.currency)}</td>
            <td className="px-4 py-3 text-right font-mono">{money(row.paid, row.currency)}</td>
            <td className="px-4 py-3 text-right font-mono">{money(row.balance, row.currency)}</td>
          </tr>
        ))}
      </tbody>
      {showTotals && (
        <tfoot className="border-t-2 border-navy-200 bg-navy-50 text-sm font-semibold text-navy">
          {[...totalsByCurrency.entries()].map(([currency, totals]) => (
            <tr key={`total:${currency}`}>
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3">{currency}</td>
              <td className="px-4 py-3 text-right font-mono">{totals.invoiceCount}</td>
              <td className="px-4 py-3 text-right font-mono">{money(totals.invoiced, currency)}</td>
              <td className="px-4 py-3 text-right font-mono">{money(totals.paid, currency)}</td>
              <td className="px-4 py-3 text-right font-mono">{money(totals.balance, currency)}</td>
            </tr>
          ))}
        </tfoot>
      )}
    </TableShell>
  );
}

export function OpenReceivablesTable({
  rows,
  hasQuery = false,
}: {
  rows: SalesListRow[];
  hasQuery?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Empty
        title={hasQuery ? 'Sin resultados' : 'No hay facturas abiertas'}
        description={
          hasQuery
            ? 'Pruebe otro cliente o número de factura.'
            : 'Las facturas completadas con saldo pendiente aparecerán aquí.'
        }
      />
    );
  }

  return (
    <TableShell>
      <thead className="border-b border-navy-100 bg-navy-50 text-navy-400">
        <tr>
          <th className="px-4 py-3 font-medium">Factura</th>
          <th className="px-4 py-3 font-medium">Cliente</th>
          <th className="px-4 py-3 font-medium">Estado</th>
          <th className="px-4 py-3 font-medium">Fecha emitida</th>
          <th className="px-4 py-3 font-medium">Vence</th>
          <th className="px-4 py-3 font-medium text-right">Total</th>
          <th className="px-4 py-3 font-medium text-right">Saldo</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-navy-100">
        {rows.map((row) => (
          <HoverRow key={row.id} to={row.href}>
            <td className="px-4 py-3">
              <EntityLink to={row.href}>
                <Mono>{row.number}</Mono>
              </EntityLink>
            </td>
            <td className="px-4 py-3">{row.customerName}</td>
            <td className="px-4 py-3">
              {row.paymentState ? <PaymentChip state={row.paymentState} /> : '—'}
            </td>
            <td className="px-4 py-3">{formatIssuedDate(row.confirmedAt)}</td>
            <td className="px-4 py-3">{formatDueDate(row.dueDate)}</td>
            <td className="px-4 py-3 text-right font-mono">{money(row.total, row.currency)}</td>
            <td className="px-4 py-3 text-right font-mono">
              {money(row.balance ?? 0, row.currency)}
            </td>
          </HoverRow>
        ))}
      </tbody>
    </TableShell>
  );
}
