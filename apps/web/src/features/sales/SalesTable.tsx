import type { SalesListRow } from '../../api/contracts/sales';
import { InvoiceStatusChip, PaymentChip } from '../../shared/domain';
import { Empty, EntityLink, HoverRow, money, Mono, TableShell } from '../../shared/ui';

export type SalesTableProps = {
  rows: SalesListRow[];
  hasQuery?: boolean;
};

export function SalesTable({ rows, hasQuery = false }: SalesTableProps) {
  if (rows.length === 0) {
    return (
      <Empty
        title={hasQuery ? 'Sin resultados' : 'No hay facturas en esta pestaña'}
        description={
          hasQuery
            ? 'Pruebe otro número, cliente o cambie de pestaña.'
            : 'Cambie de pestaña o cree un borrador con Nuevo borrador.'
        }
      />
    );
  }

  return (
    <TableShell>
      <thead className="border-b border-navy-100 bg-navy-50 text-navy-400">
        <tr>
          <th className="px-4 py-3 font-medium">Documento</th>
          <th className="px-4 py-3 font-medium">Cliente</th>
          <th className="px-4 py-3 font-medium">Estado</th>
          <th className="px-4 py-3 font-medium">Pago</th>
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
              {row.fiscal && <p className="mt-0.5 text-xs text-navy-400">Con comprobante fiscal</p>}
            </td>
            <td className="px-4 py-3">{row.customerName}</td>
            <td className="px-4 py-3">
              <InvoiceStatusChip status={row.status} />
            </td>
            <td className="px-4 py-3">
              {row.status === 'COMPLETED' ? (
                <PaymentChip state={row.paymentState} />
              ) : (
                <span className="text-navy-400">—</span>
              )}
            </td>
            <td className="px-4 py-3 text-right font-mono">{money(row.total, row.currency)}</td>
            <td className="px-4 py-3 text-right font-mono">
              {row.status !== 'DRAFT' ? money(row.balance, row.currency) : '—'}
            </td>
          </HoverRow>
        ))}
      </tbody>
    </TableShell>
  );
}
