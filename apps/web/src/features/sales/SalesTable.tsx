import type { SalesListRow } from '../../api/contracts/sales';
import { InvoiceStatusChip, PaymentChip } from '../../shared/domain';
import { Empty, EntityLink, HoverRow, money, Mono, shortDate, TableShell } from '../../shared/ui';

export type SalesTableProps = {
  rows: SalesListRow[];
  hasQuery?: boolean;
  showPaymentSettlement?: boolean;
};

export function SalesTable({
  rows,
  hasQuery = false,
  showPaymentSettlement = false,
}: SalesTableProps) {
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
          <th className="px-4 py-3 font-medium">Fecha</th>
          <th className="px-4 py-3 font-medium">Estado</th>
          {showPaymentSettlement ? <th className="px-4 py-3 font-medium">Pago</th> : null}
          <th className="px-4 py-3 font-medium text-right">Total</th>
          {showPaymentSettlement ? (
            <th className="px-4 py-3 font-medium text-right">Saldo</th>
          ) : null}
        </tr>
      </thead>
      <tbody className="divide-y divide-navy-100">
        {rows.map((row) => {
          const documentDate = row.confirmedAt ?? row.quoteIssuedAt;

          return (
            <HoverRow key={row.id} to={row.href}>
              <td className="px-4 py-3">
                <EntityLink to={row.href}>
                  <Mono>{row.number}</Mono>
                </EntityLink>
                {row.quoteNumber && row.quoteNumber !== row.number ? (
                  <p className="mt-0.5 text-xs text-navy-400">Origen {row.quoteNumber}</p>
                ) : null}
                {row.fiscal && <p className="mt-0.5 text-xs text-navy-400">Con comprobante fiscal</p>}
              </td>
              <td className="px-4 py-3">{row.customerName}</td>
              <td className="px-4 py-3 text-navy-500">
                {documentDate ? shortDate(documentDate) : <span className="text-navy-400">—</span>}
              </td>
              <td className="px-4 py-3">
                <InvoiceStatusChip status={row.status} />
              </td>
              {showPaymentSettlement ? (
                <td className="px-4 py-3">
                  {row.status === 'COMPLETED' && row.paymentState ? (
                    <PaymentChip state={row.paymentState} />
                  ) : (
                    <span className="text-navy-400">—</span>
                  )}
                </td>
              ) : null}
              <td className="px-4 py-3 text-right font-mono">{money(row.total, row.currency)}</td>
              {showPaymentSettlement ? (
                <td className="px-4 py-3 text-right font-mono">
                  {(row.status === 'COMPLETED' || row.status === 'CANCELLED') && row.balance != null
                    ? money(row.balance, row.currency)
                    : '—'}
                </td>
              ) : null}
            </HoverRow>
          );
        })}
      </tbody>
    </TableShell>
  );
}
