import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { CustomerListRow, CustomerType, SaveCustomerInput } from '../../api/contracts/customers';
import { useAuth } from '../auth/useAuth';
import { parseListPage, setListPageParam } from '../../api/contracts/pagination';
import { presentAppError } from '../../shared/errors/present-app-error';
import {
  Button,
  Field,
  Info,
  PaginationBar,
  SearchInput,
  Select,
  Skeleton,
  toPageLoadMessage,
  useToast,
} from '../../shared/ui';
import { PageHeader } from '../../shared/layout/PageHeader';
import { CustomerFormModal } from './CustomerFormModal';
import { CustomerTable } from './CustomerTable';
import { useCustomers } from './useCustomers';

type CustomerTypeFilter = CustomerType | 'ALL';

export function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseListPage(searchParams.get('page'));
  const { user } = useAuth();
  const canManageCredit = user?.role === 'ADMINISTRATOR';
  const [customerTypeFilter, setCustomerTypeFilter] = useState<CustomerTypeFilter>('ALL');
  const customerTypeQuery = customerTypeFilter === 'ALL' ? undefined : customerTypeFilter;
  const { query, setQuery, result, isSaving, save } = useCustomers(page, customerTypeQuery);
  const { pushToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerListRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setFieldErrors({});
    setModalOpen(true);
  }

  function openEdit(row: CustomerListRow) {
    setEditing(row);
    setFormError(null);
    setFieldErrors({});
    setModalOpen(true);
  }

  function closeModal() {
    if (isSaving) {
      return;
    }
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
    setFieldErrors({});
  }

  async function handleSubmit(input: SaveCustomerInput) {
    setFormError(null);
    setFieldErrors({});
    const response = await save(input);

    if (!response.ok) {
      const presented = presentAppError(response.error);
      setFormError(presented.summary);
      setFieldErrors(presented.fields);
      return;
    }

    pushToast(input.id ? 'Cliente actualizado' : 'Cliente creado', 'success');
    setModalOpen(false);
    setEditing(null);
  }

  if (result.status === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar los clientes">
        {toPageLoadMessage(result.error.message, 'No pudimos cargar los clientes.')}
      </Info>
    );
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Directorio para facturación."
        actions={
          <Button onClick={openCreate} disabled={result.status === 'loading'}>
            Nuevo cliente
          </Button>
        }
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="max-w-md flex-1">
          <SearchInput
            id="customer-search"
            label="Buscar por nombre o identificación fiscal"
            placeholder="Nombre o identificación fiscal / cédula"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchParams(
                (prev) => {
                  const nextParams = new URLSearchParams(prev);
                  setListPageParam(nextParams, 1);
                  return nextParams;
                },
                { replace: true },
              );
            }}
          />
        </div>
        <div className="w-full sm:w-52">
          <Field label="Tipo de cliente" htmlFor="customer-type-filter">
            <Select
              id="customer-type-filter"
              value={customerTypeFilter}
              onChange={(event) => {
                const next = event.target.value as CustomerTypeFilter;
                setCustomerTypeFilter(next);
                setSearchParams(
                  (prev) => {
                    const nextParams = new URLSearchParams(prev);
                    setListPageParam(nextParams, 1);
                    return nextParams;
                  },
                  { replace: true },
                );
              }}
            >
              <option value="ALL">Todos</option>
              <option value="CASH">Contado</option>
              <option value="CREDIT">Crédito</option>
            </Select>
          </Field>
        </div>
      </div>

      {result.status === 'loading' ? (
        <Skeleton label="Cargando clientes" />
      ) : (
        <>
          <CustomerTable
            rows={result.rows}
            canManageCredit={canManageCredit}
            onEdit={openEdit}
          />
          <PaginationBar
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            onPageChange={(nextPage) => {
              setSearchParams(
                (prev) => {
                  const nextParams = new URLSearchParams(prev);
                  setListPageParam(nextParams, nextPage);
                  return nextParams;
                },
                { replace: true },
              );
            }}
          />
        </>
      )}

      <CustomerFormModal
        open={modalOpen}
        customer={editing}
        canManageCredit={canManageCredit}
        isSaving={isSaving}
        error={formError}
        fieldErrors={fieldErrors}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />
    </>
  );
}
