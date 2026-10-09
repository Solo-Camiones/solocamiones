import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { can } from '../../shared/auth/policies';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { UX_TERMS } from '../../shared/copy/glossary';
import { Button, Info, useToast } from '../../shared/ui';
import { ItemAdminActions } from './ItemAdminActions';
import { ItemDetailViewPanel } from './ItemDetailView';
import { ItemDetailsEditor } from './ItemDetailsEditor';
import { QtyProductDetail } from './QtyProductDetail';
import { useInventoryDetail } from './useInventoryDetail';

export function InventoryDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const capabilities = useAppCapabilities();
  const { pushToast } = useToast();
  const query = useInventoryDetail(id);
  const [actionError, setActionError] = useState<string | null>(null);
  const isAdmin = can(user, 'inventory.admin');
  const canEditDetails = can(user, 'inventory.register');

  if (query.result.status === 'loading') {
    return (
      <p className="text-sm text-navy-400" aria-live="polite">
        Cargando detalle…
      </p>
    );
  }

  if (query.result.status === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar el detalle del inventario">
        {query.result.error.message}
      </Info>
    );
  }

  const { detail } = query.result;

  async function handleAddToDraft() {
    setActionError(null);
    const input =
      detail.kind === 'ITEM' ? { itemId: detail.id } : { qtyProductId: detail.id, quantity: 1 };
    const response = await query.addToDraft(input);
    if (!response.ok) {
      setActionError(response.error.message);
      return;
    }
    pushToast('Abriendo punto de venta', 'success');
  }

  const canAddToDraft =
    capabilities.sales &&
    (detail.kind === 'QTY' ? capabilities.quantitySales : capabilities.inventorySales);

  const draftButton = canAddToDraft ? (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      {actionError && (
        <Info tone="error" title="No se agregó al borrador">
          {actionError}
        </Info>
      )}
      <Button
        disabled={query.isMutating || !detail.draftEligibility.allowed}
        title={detail.draftEligibility.reason}
        onClick={() => {
          void handleAddToDraft();
        }}
      >
        Agregar a borrador
      </Button>
      {!detail.draftEligibility.allowed && detail.draftEligibility.reason && (
        <p className="max-w-sm text-right text-xs text-navy-400">
          {detail.draftEligibility.reason}
        </p>
      )}
    </div>
  ) : null;

  if (detail.kind === 'QTY') {
    const canReceive = canEditDetails;
    return (
      <QtyProductDetail
        detail={detail}
        actions={draftButton}
        canEdit={canEditDetails}
        canReceive={canReceive}
        canAdjust={isAdmin}
        isMutating={query.isMutating}
        onEdit={async (input) => {
          const response = await query.updateQtyProductDetails({
            qtyProductId: detail.id,
            ...input,
          });
          if (!response.ok) {
            return response.error.message;
          }
          pushToast('Datos actualizados', 'success');
          return null;
        }}
        onReceive={async (input) => {
          const response = await query.receiveQtyStock({ qtyProductId: detail.id, ...input });
          if (!response.ok) {
            return response.error.message;
          }
          pushToast('Entrada de stock registrada', 'success');
          return null;
        }}
        onAdjust={async (input) => {
          const response = await query.adjustQtyStock({ qtyProductId: detail.id, ...input });
          if (!response.ok) {
            return response.error.message;
          }
          pushToast('Existencia ajustada', 'success');
          return null;
        }}
      />
    );
  }

  return (
    <ItemDetailViewPanel
      detail={detail}
      actions={
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          {draftButton}
          {canEditDetails && (
            <ItemDetailsEditor
              detail={detail}
              isMutating={query.isMutating}
              onSave={async (input) => {
                const response = await query.updateItemDetails({ itemId: detail.id, ...input });
                if (!response.ok) {
                  return response.error.message;
                }
                pushToast('Datos actualizados', 'success');
                return null;
              }}
            />
          )}
          {isAdmin && (
            <ItemAdminActions
              detail={detail}
              isMutating={query.isMutating}
              onSetNoDesarmar={async (enabled) => {
                const response = await query.setNoDesarmar({ itemId: detail.id, enabled });
                if (!response.ok) {
                  return response.error.message;
                }
                pushToast(enabled ? 'No desarmar aplicado' : 'No desarmar retirado', 'success');
                return null;
              }}
              onCorrectCost={async (input) => {
                const response = await query.correctCost({ itemId: detail.id, ...input });
                if (!response.ok) {
                  return response.error.message;
                }
                pushToast('Costo corregido', 'success');
                return null;
              }}
              onCorrectBaseline={async (input) => {
                const response = await query.correctBaseline({ itemId: detail.id, ...input });
                if (!response.ok) {
                  return response.error.message;
                }
                pushToast(UX_TERMS.receiptRecordCorrected, 'success');
                return null;
              }}
              onResolveCatalogReview={async (input) => {
                const response = await query.resolveCatalogReview({ itemId: detail.id, ...input });
                if (!response.ok) {
                  return response.error.message;
                }
                pushToast(
                  input.decision === 'MISSING'
                    ? 'Componente marcado como falta'
                    : input.decision === 'PRESENT'
                      ? 'Pieza registrada en el ensamblaje'
                      : input.decision === 'ACKNOWLEDGE'
                        ? 'Coincidencia reconocida'
                        : 'Componente confirmado como no aplica',
                  'success',
                );
                return null;
              }}
              onCreateWorkOrder={async (input) => {
                const response = await query.createWorkOrder({ pieceId: detail.id, ...input });
                if (!response.ok) {
                  return response.error.message;
                }
                pushToast('Orden de trabajo creada', 'success');
                return null;
              }}
            />
          )}
        </div>
      }
    />
  );
}
