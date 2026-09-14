import type { CustomerOutstandingRow, SalesListRow } from '../../api/contracts/sales';
import { PaymentChip } from '../../shared/domain';
import { Empty, EntityLink, HoverRow, money, Mono, TableShell } from '../../shared/ui';

function formatDueDate(value?: string): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
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
            ? 'Pruebe otro nombre de cliente.'
            : 'Las facturas completadas con saldo pendiente aparecerán agrupadas por cliente y moneda.'
        }
      />
    );
  }

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
            ? 'Pruebe otro nombre de cliente.'
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
              <PaymentChip state={row.paymentState} />
            </td>
            <td className="px-4 py-3">{formatDueDate(row.dueDate)}</td>
            <td className="px-4 py-3 text-right font-mono">{money(row.total, row.currency)}</td>
            <td className="px-4 py-3 text-right font-mono">{money(row.balance, row.currency)}</td>
          </HoverRow>
        ))}
      </tbody>
    </TableShell>
  );
}
