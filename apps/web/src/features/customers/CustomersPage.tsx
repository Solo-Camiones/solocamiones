import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { CustomerListRow, SaveCustomerInput } from '../../api/contracts/customers';
import { parseListPage, setListPageParam } from '../../api/contracts/pagination';
import { presentAppError } from '../../shared/errors/present-app-error';
import { Button, Info, PaginationBar, SearchInput, Skeleton, toPageLoadMessage, useToast } from '../../shared/ui';
import { PageHeader } from '../../shared/layout/PageHeader';
import { CustomerFormModal } from './CustomerFormModal';
import { CustomerTable } from './CustomerTable';
import { useCustomers } from './useCustomers';

export function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseListPage(searchParams.get('page'));
  const { query, setQuery, result, isSaving, save } = useCustomers(page);
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

      <div className="mb-6 max-w-md">
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

      {result.status === 'loading' ? (
        <Skeleton label="Cargando clientes" />
      ) : (
        <>
          <CustomerTable rows={result.rows} onEdit={openEdit} />
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
        isSaving={isSaving}
        error={formError}
        fieldErrors={fieldErrors}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />
    </>
  );
}
