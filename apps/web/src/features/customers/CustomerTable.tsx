import { Fragment, useState } from 'react';

import { DEFAULT_CASH_CUSTOMER_ID, type CustomerListRow } from '../../api/contracts/customers';
import type { CustomerContact } from '../../api/contracts/entities';
import { formatFiscalId } from '../../shared/domain/fiscal-id';
import { formatDominicanPhone } from '../../shared/domain/phone';
import { Button, Chip, Empty, HoverRow, TableShell } from '../../shared/ui';
import { customerTypeChipTone, customerTypeLabel } from './customer-type-labels';

const CUSTOMER_TABLE_COLUMN_COUNT = 4;

function primaryContact(contacts: CustomerContact[]): CustomerContact | undefined {
  return contacts.find((contact) => contact.isPrimary) ?? contacts[0];
}

function contactsPanelId(customerId: string): string {
  return `customer-${customerId}-contacts`;
}

function trimmed(value: string | undefined): string {
  return value?.trim() ?? '';
}

function contactDisplayName(contact: CustomerContact): string {
  return trimmed(contact.name) || trimmed(contact.title) || 'Contacto';
}

function orderedContacts(contacts: CustomerContact[]): CustomerContact[] {
  return [...contacts].sort((left, right) => Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary)));
}

function CustomerContactsPanel({ contacts }: { contacts: CustomerContact[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {orderedContacts(contacts).map((contact) => (
        <li
          key={contact.id}
          className="rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm text-navy"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{contactDisplayName(contact)}</span>
            {contact.isPrimary === true && <Chip tone="brand">Principal</Chip>}
          </div>
          {trimmed(contact.title) && trimmed(contact.name) ? (
            <p className="mt-0.5 text-xs text-navy-400">{contact.title}</p>
          ) : null}
          <p className="mt-1 text-navy-500">{formatDominicanPhone(contact.phone) || '—'}</p>
          {contact.email && <p className="text-xs text-navy-400">{contact.email}</p>}
        </li>
      ))}
    </ul>
  );
}

export type CustomerTableProps = {
  rows: CustomerListRow[];
  canManageCredit: boolean;
  onEdit: (row: CustomerListRow) => void;
};

export function CustomerTable({ rows, canManageCredit, onEdit }: CustomerTableProps) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());

  function toggleContacts(customerId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <Empty
        title="No hay clientes"
        description="Pruebe otra búsqueda o cree un cliente nuevo."
      />
    );
  }

  return (
    <TableShell>
      <thead className="border-b border-navy-100 bg-navy-50 text-navy-400">
        <tr>
          <th className="px-4 py-3 font-medium">Nombre</th>
          <th className="px-4 py-3 font-medium">Identificación fiscal / cédula</th>
          <th className="px-4 py-3 font-medium">Contacto</th>
          <th className="px-4 py-3 font-medium">
            <span className="sr-only">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-navy-100">
        {rows.map((row) => {
          const isDefault = row.id === DEFAULT_CASH_CUSTOMER_ID || row.isDefault === true;
          const isCredit = row.customerType === 'CREDIT';
          const creditEditBlocked = isCredit && !canManageCredit;
          const editDisabled = isDefault || creditEditBlocked;
          const editTitle = isDefault
            ? 'Cliente Contado no se puede editar'
            : creditEditBlocked
              ? 'Solo el Administrador puede editar clientes a crédito'
              : 'Editar cliente';
          const primary = primaryContact(row.contacts);
          const hasMultipleContacts = row.contacts.length > 1;
          const isExpanded = expandedIds.has(row.id);
          const panelId = contactsPanelId(row.id);

          return (
            <Fragment key={row.id}>
              <HoverRow>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{row.name}</span>
                    <Chip tone={customerTypeChipTone(row.customerType)}>
                      {customerTypeLabel(row.customerType)}
                    </Chip>
                    {isDefault && <Chip tone="brand">Predeterminado</Chip>}
                  </div>
                </td>
                <td className="px-4 py-3 text-navy-400">{formatFiscalId(row.rnc) || '—'}</td>
                <td className="px-4 py-3 text-sm text-navy-400">
                  {primary &&
                  (trimmed(primary.name) || primary.phone || primary.email) ? (
                    <>
                      {trimmed(primary.name) && (
                        <span className="block font-medium text-navy">{trimmed(primary.name)}</span>
                      )}
                      {primary.phone && (
                        <span className="block">{formatDominicanPhone(primary.phone)}</span>
                      )}
                      {primary.email && <span className="block">{primary.email}</span>}
                    </>
                  ) : (
                    '—'
                  )}
                  {hasMultipleContacts && (
                    <button
                      type="button"
                      className="mt-1 block rounded text-left text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light/50"
                      aria-expanded={isExpanded}
                      aria-controls={isExpanded ? panelId : undefined}
                      onClick={() => toggleContacts(row.id)}
                    >
                      {isExpanded ? 'Ocultar contactos' : `Ver ${row.contacts.length} contactos`}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={editDisabled}
                    title={editTitle}
                    onClick={() => onEdit(row)}
                  >
                    Editar
                  </Button>
                </td>
              </HoverRow>
              {isExpanded && (
                <tr className="bg-navy-50/50">
                  <td colSpan={CUSTOMER_TABLE_COLUMN_COUNT} className="px-4 py-3">
                    <div id={panelId}>
                      <p className="sr-only">Contactos de {row.name}</p>
                      <CustomerContactsPanel contacts={row.contacts} />
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </TableShell>
  );
}
