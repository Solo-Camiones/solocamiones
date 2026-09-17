import type { ManagedUser } from '../../api/contracts/users';
import { AccountStateChip } from '../../shared/domain';
import { formatDominicanPhone } from '../../shared/domain/phone';
import { roleLabel } from '../../shared/auth/policies';
import { Button, Empty, HoverRow, TableShell } from '../../shared/ui';

export type UserTableProps = {
  rows: ManagedUser[];
  onEdit: (row: ManagedUser) => void;
  onToggleActive: (row: ManagedUser) => void;
  togglingId: string | null;
};

export function UserTable({ rows, onEdit, onToggleActive, togglingId }: UserTableProps) {
  if (rows.length === 0) {
    return (
      <Empty title="No hay usuarios" description="Pruebe otra búsqueda o cree una cuenta nueva." />
    );
  }

  return (
    <TableShell>
      <thead className="border-b border-navy-100 bg-navy-50 text-navy-400">
        <tr>
          <th className="px-4 py-3 font-medium">Nombre</th>
          <th className="px-4 py-3 font-medium">Usuario</th>
          <th className="px-4 py-3 font-medium">Rol</th>
          <th className="px-4 py-3 font-medium">Estado</th>
          <th className="px-4 py-3 font-medium">Contacto</th>
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
            <td className="px-4 py-3 font-mono text-navy-400">{row.username}</td>
            <td className="px-4 py-3">{roleLabel(row.role)}</td>
            <td className="px-4 py-3">
              <AccountStateChip active={row.active} />
              {row.mustChangePassword && row.active && (
                <span className="mt-1 block text-xs text-amber-700">Debe cambiar contraseña</span>
              )}
            </td>
            <td className="px-4 py-3 text-sm text-navy-400">
              {row.phone || row.email ? (
                <>
                  {row.phone && <span className="block">{formatDominicanPhone(row.phone)}</span>}
                  {row.email && <span className="block">{row.email}</span>}
                </>
              ) : (
                '—'
              )}
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
