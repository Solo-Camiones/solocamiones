import { useState } from 'react';

import type { SaveCategoryInput, SaveServiceInput } from '../../api/contracts/catalogs';
import type { Category, Service } from '../../api/contracts/entities';
import {
  Button,
  ConfirmActionModal,
  Info,
  Skeleton,
  toPageLoadMessage,
  useToast,
} from '../../shared/ui';
import { PageHeader } from '../../shared/layout/PageHeader';
import { Tabs } from '../../shared/layout/Tabs';
import { CategoryFormModal } from './CategoryFormModal';
import { CategoryList } from './CategoryList';
import { ServiceFormModal } from './ServiceFormModal';
import { ServiceList } from './ServiceList';
import { useCatalogs, type CatalogTab } from './useCatalogs';

const TABS: { id: CatalogTab; label: string }[] = [
  { id: 'categories', label: 'Categorías' },
  { id: 'services', label: 'Servicios' },
];

export function CatalogsPage() {
  const {
    tab,
    setTab,
    showCategories,
    categories,
    services,
    isSaving,
    saveCategory,
    saveService,
  } = useCatalogs();
  const { pushToast } = useToast();
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingServiceId, setTogglingServiceId] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<Service | null>(null);

  function openCreateCategory() {
    setEditingCategory(null);
    setFormError(null);
    setCategoryModalOpen(true);
  }

  function openCreateService() {
    setEditingService(null);
    setFormError(null);
    setServiceModalOpen(true);
  }

  function closeCategoryModal() {
    if (isSaving) {
      return;
    }
    setCategoryModalOpen(false);
    setEditingCategory(null);
    setFormError(null);
  }

  function closeServiceModal() {
    if (isSaving) {
      return;
    }
    setServiceModalOpen(false);
    setEditingService(null);
    setFormError(null);
  }

  async function handleCategorySubmit(input: SaveCategoryInput) {
    setFormError(null);
    const response = await saveCategory(input);
    if (!response.ok) {
      setFormError(response.error.message);
      return;
    }

    pushToast(input.id ? 'Categoría actualizada' : 'Categoría creada', 'success');
    setCategoryModalOpen(false);
    setEditingCategory(null);
  }

  async function handleServiceSubmit(input: SaveServiceInput) {
    setFormError(null);
    const response = await saveService(input);
    if (!response.ok) {
      setFormError(response.error.message);
      return;
    }

    pushToast('id' in input ? 'Servicio actualizado' : 'Servicio creado', 'success');
    setServiceModalOpen(false);
    setEditingService(null);
  }

  async function handleToggleService(row: Service) {
    setTogglingServiceId(row.id);
    const response = await saveService({
      id: row.id,
      active: !row.active,
    });
    setTogglingServiceId(null);

    if (!response.ok) {
      pushToast(response.error.message, 'error');
      return;
    }

    setPendingToggle(null);
    pushToast(row.active ? 'Servicio desactivado' : 'Servicio activado', 'success');
  }

  const loadError =
    categories.status === 'error'
      ? categories.error
      : services.status === 'error'
        ? services.error
        : null;

  if (loadError) {
    return (
      <Info tone="error" title="No se pudo cargar los catálogos">
        {toPageLoadMessage(loadError.message, 'No pudimos cargar los catálogos.')}
      </Info>
    );
  }

  const isLoading =
    services.status === 'loading' || (showCategories && categories.status === 'loading');
  const servicePanel = isLoading ? (
    <Skeleton label="Cargando catálogos" />
  ) : services.status === 'ready' ? (
    <ServiceList
      rows={services.rows}
      togglingId={togglingServiceId}
      onEdit={(row) => {
        setEditingService(row);
        setFormError(null);
        setServiceModalOpen(true);
      }}
      onToggleActive={setPendingToggle}
    />
  ) : null;

  return (
    <>
      <PageHeader
        title="Catálogos"
        description={
          showCategories
            ? 'Categorías y servicios.'
            : 'Servicios mecánicos.'
        }
        actions={
          showCategories && tab === 'categories' ? (
            <Button onClick={openCreateCategory} disabled={isLoading}>
              Nueva categoría
            </Button>
          ) : (
            <Button onClick={openCreateService} disabled={isLoading}>
              Nuevo servicio
            </Button>
          )
        }
      />

      {showCategories ? (
        <Tabs
          aria-label="Tipo de catálogo"
          tabs={TABS}
          value={tab}
          onChange={setTab}
          panels={{
            categories: isLoading ? (
              <Skeleton label="Cargando catálogos" />
            ) : categories.status === 'ready' ? (
              <CategoryList
                rows={categories.rows}
                onEdit={(row) => {
                  setEditingCategory(row);
                  setFormError(null);
                  setCategoryModalOpen(true);
                }}
              />
            ) : null,
            services: servicePanel,
          }}
        />
      ) : (
        servicePanel
      )}

      {showCategories ? (
        <CategoryFormModal
          open={categoryModalOpen}
          category={editingCategory}
          isSaving={isSaving}
          error={formError}
          onClose={closeCategoryModal}
          onSubmit={(input) => {
            void handleCategorySubmit(input);
          }}
        />
      ) : null}

      <ServiceFormModal
        open={serviceModalOpen}
        service={editingService}
        isSaving={isSaving}
        error={formError}
        onClose={closeServiceModal}
        onSubmit={(input) => {
          void handleServiceSubmit(input);
        }}
      />

      <ConfirmActionModal
        open={pendingToggle != null}
        title={pendingToggle?.active ? 'Desactivar servicio' : 'Activar servicio'}
        confirmLabel={pendingToggle?.active ? 'Desactivar' : 'Activar'}
        confirmVariant={pendingToggle?.active ? 'danger' : 'primary'}
        busy={Boolean(pendingToggle && togglingServiceId === pendingToggle.id)}
        onCancel={() => {
          if (!togglingServiceId) setPendingToggle(null);
        }}
        onConfirm={() => {
          if (pendingToggle) void handleToggleService(pendingToggle);
        }}
      >
        {pendingToggle?.active ? (
          <Info tone="warning" title="Dejará de ofrecerse en ventas">
            {pendingToggle.name} no aparecerá al facturar. Las facturas existentes no cambian.
          </Info>
        ) : (
          <p className="text-sm text-navy-700">
            Se volverá a ofrecer <strong>{pendingToggle?.name}</strong> en el punto de venta.
          </p>
        )}
      </ConfirmActionModal>
    </>
  );
}
