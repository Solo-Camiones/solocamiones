import type { Service } from '../../api/contracts/entities';
import { AccountStateChip } from '../../shared/domain';
import { Button, Empty, HoverRow, TableShell } from '../../shared/ui';

export type ServiceListProps = {
  rows: Service[];
  onEdit: (row: Service) => void;
  onToggleActive: (row: Service) => void;
  togglingId: string | null;
};

export function ServiceList({ rows, onEdit, onToggleActive, togglingId }: ServiceListProps) {
  if (rows.length === 0) {
    return (
      <Empty
        title="No hay servicios"
        description="Agregue un servicio mecánico para ofrecerlo en el punto de venta."
      />
    );
  }

  return (
    <TableShell>
      <thead className="border-b border-navy-100 bg-navy-50 text-navy-400">
        <tr>
          <th className="px-4 py-3 font-medium">Nombre</th>
          <th className="px-4 py-3 font-medium">Estado</th>
          <th className="px-4 py-3 font-medium">
            <span className="sr-only">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-navy-100">
        {rows.map((row) => (
          <HoverRow key={row.id}>
            <td className="px-4 py-3">
              <span className="font-medium">{row.name}</span>
            </td>
            <td className="px-4 py-3">
              <AccountStateChip active={row.active} />
            </td>
            <td className="px-4 py-3">
              <div className="flex justify-end gap-2">
                <Button
                  variant={row.active ? 'danger' : 'secondary'}
                  size="sm"
                  disabled={togglingId === row.id}
                  onClick={() => onToggleActive(row)}
                >
                  {row.active ? 'Desactivar' : 'Activar'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onEdit(row)}>
                  Editar
                </Button>
              </div>
            </td>
          </HoverRow>
        ))}
      </tbody>
    </TableShell>
  );
}
