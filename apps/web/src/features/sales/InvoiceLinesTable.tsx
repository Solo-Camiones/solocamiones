import type { InvoiceLineView } from '../../api/contracts/sales';
import type { Currency } from '../../api/contracts/entities';
import { HoverRow, money, Mono, TableShell } from '../../shared/ui';
import { LINE_TYPE_LABELS } from './labels';
import { InvoiceLineNoteText } from './InvoiceLineNoteText';

export type InvoiceLinesTableProps = {
  lines: InvoiceLineView[];
  currency: Currency;
};

export function InvoiceLinesTable({ lines, currency }: InvoiceLinesTableProps) {
  return (
    <TableShell>
      <thead className="border-b border-navy-100 bg-navy-50 text-navy-400">
        <tr>
          <th className="px-4 py-3 font-medium">Línea</th>
          <th className="px-4 py-3 font-medium">Tipo</th>
          <th className="px-4 py-3 font-medium text-right">Cantidad</th>
          <th className="px-4 py-3 font-medium text-right">Precio</th>
          <th className="px-4 py-3 font-medium text-right">ITBIS</th>
          <th className="px-4 py-3 font-medium text-right">Total</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-navy-100">
        {lines.map((line) => (
          <HoverRow key={line.id}>
            <td className="px-4 py-3">
              <div>{line.description}</div>
              <InvoiceLineNoteText notes={line.notes} />
            </td>
            <td className="px-4 py-3 text-navy-400">{LINE_TYPE_LABELS[line.type]}</td>
            <td className="px-4 py-3 text-right font-mono">{line.quantity}</td>
            <td className="px-4 py-3 text-right font-mono">{money(line.base, currency)}</td>
            <td className="px-4 py-3 text-right font-mono">{money(line.itbis, currency)}</td>
            <td className="px-4 py-3 text-right font-mono">
              <Mono>{money(line.gross, currency)}</Mono>
            </td>
          </HoverRow>
        ))}
      </tbody>
    </TableShell>
  );
}
