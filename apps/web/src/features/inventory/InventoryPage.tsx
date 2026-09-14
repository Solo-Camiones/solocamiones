import { useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { can } from '../../shared/auth/policies';
import { Button, Info, Skeleton, toPageLoadMessage } from '../../shared/ui';
import { PageHeader } from '../../shared/layout/PageHeader';
import { InventoryFilters } from './InventoryFilters';
import { InventoryTable } from './InventoryTable';
import { useInventoryCatalog } from './useInventoryCatalog';
import { RegisterItemWizard } from './RegisterItemWizard';

export function InventoryPage() {
  const { user } = useAuth();
  const { filters, patchFilters, result, categories, refresh } = useInventoryCatalog();
  const [registerOpen, setRegisterOpen] = useState(false);
  const canRegister = can(user, 'inventory.register');

  if (result.status === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar el inventario">
        {toPageLoadMessage(result.error.message, 'No pudimos cargar el inventario.')}
      </Info>
    );
  }

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Piezas y productos por cantidad."
        actions={
          canRegister ? (
            <Button onClick={() => setRegisterOpen(true)}>Registrar inventario</Button>
          ) : undefined
        }
      />

      <InventoryFilters filters={filters} categories={categories} onChange={patchFilters} />

      {result.status === 'loading' ? (
        <Skeleton label="Cargando inventario" />
      ) : (
        <InventoryTable rows={result.rows} />
      )}

      {canRegister && (
        <RegisterItemWizard
          open={registerOpen}
          categories={categories}
          onClose={() => setRegisterOpen(false)}
          onRegistered={() => {
            refresh();
          }}
        />
      )}
    </>
  );
}
