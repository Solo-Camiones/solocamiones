import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type {
  ManagedUser,
  PasswordRecoveryRequest,
  SaveUserInput,
} from '../../api/contracts/users';
import { parseListPage, setListPageParam } from '../../api/contracts/pagination';
import {
  Button,
  ConfirmActionModal,
  Info,
  Modal,
  PaginationBar,
  SearchInput,
  Skeleton,
  toPageLoadMessage,
  useToast,
} from '../../shared/ui';
import { PageHeader } from '../../shared/layout/PageHeader';
import { UserFormModal } from './UserFormModal';
import { UserTable } from './UserTable';
import { useUsers } from './useUsers';
import { RecoveryRequestsPanel } from './RecoveryRequestsPanel';
import { useRecoveryRequests } from './useRecoveryRequests';

type RecoveryAction = {
  request: PasswordRecoveryRequest;
  action: 'approve' | 'reject';
};

export function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseListPage(searchParams.get('page'));
  const { query, setQuery, result, isSaving, save } = useUsers(page);
  const recovery = useRecoveryRequests();
  const { pushToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<ManagedUser | null>(null);
  const [recoveryAction, setRecoveryAction] = useState<RecoveryAction | null>(null);
  const [identityVerified, setIdentityVerified] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [initialPassword, setInitialPassword] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (isSaving) {
      return;
    }
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  }

  async function handleSubmit(input: SaveUserInput) {
    setFormError(null);
    const response = await save(input);
    if (!response.ok) {
      setFormError(response.error.message);
      return;
    }

    pushToast(input.id ? 'Usuario actualizado' : 'Usuario creado', 'success');
    setModalOpen(false);
    setEditing(null);
    if (!input.id) {
      if (response.value.initialPassword) {
        setInitialPassword(response.value.initialPassword);
      } else {
        pushToast('El usuario fue creado, pero no se recibió la contraseña inicial.', 'error');
      }
    }
  }

  async function handleToggleActive(row: ManagedUser) {
    setTogglingId(row.id);
    const response = await save({
      id: row.id,
      name: row.name,
      username: row.username,
      role: row.role,
      active: !row.active,
      phone: row.phone,
      email: row.email,
    });
    setTogglingId(null);

    if (!response.ok) {
      pushToast(response.error.message, 'error');
      return;
    }

    setPendingToggle(null);
    pushToast(row.active ? 'Usuario desactivado' : 'Usuario activado', 'success');
  }

  async function handleResolveRecovery() {
    if (!recoveryAction) return;
    const input =
      recoveryAction.action === 'approve'
        ? {
            requestId: recoveryAction.request.id,
            action: 'approve' as const,
            identityVerified: true as const,
          }
        : { requestId: recoveryAction.request.id, action: 'reject' as const };
    const response = await recovery.resolve(input);
    if (!response.ok) {
      pushToast(response.error.message, 'error');
      return;
    }

    const action = recoveryAction.action;
    setRecoveryAction(null);
    setIdentityVerified(false);
    if (action === 'approve') {
      if (response.value.temporaryPassword) {
        setTemporaryPassword(response.value.temporaryPassword);
      } else {
        pushToast('La solicitud fue aprobada, pero no se recibió la contraseña temporal.', 'error');
      }
    } else {
      pushToast('Solicitud rechazada', 'success');
    }
  }

  if (result.status === 'error') {
    return (
      <Info tone="error" title="No se pudo cargar los usuarios">
        {toPageLoadMessage(result.error.message, 'No pudimos cargar los usuarios.')}
      </Info>
    );
  }

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Gestione cuentas y el acceso al sistema."
        actions={
          <Button onClick={openCreate} disabled={result.status === 'loading'}>
            Nuevo usuario
          </Button>
        }
      />

      <div className="mb-6 max-w-md">
        <SearchInput
          id="user-search"
          label="Buscar por nombre o usuario"
          placeholder="Nombre o usuario"
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
        <Skeleton label="Cargando usuarios" />
      ) : (
        <>
          <UserTable
            rows={result.rows}
            togglingId={togglingId}
            onEdit={(row) => {
              setEditing(row);
              setFormError(null);
              setModalOpen(true);
            }}
            onToggleActive={setPendingToggle}
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

      <RecoveryRequestsPanel
        result={recovery.result}
        resolvingId={recovery.resolvingId}
        onApprove={(request) => {
          setIdentityVerified(false);
          setRecoveryAction({ request, action: 'approve' });
        }}
        onReject={(request) => {
          setRecoveryAction({ request, action: 'reject' });
        }}
      />

      <ConfirmActionModal
        open={pendingToggle != null}
        title={pendingToggle?.active ? 'Desactivar usuario' : 'Activar usuario'}
        confirmLabel={pendingToggle?.active ? 'Desactivar' : 'Activar'}
        confirmVariant={pendingToggle?.active ? 'danger' : 'primary'}
        busy={Boolean(pendingToggle && togglingId === pendingToggle.id)}
        onCancel={() => {
          if (!togglingId) setPendingToggle(null);
        }}
        onConfirm={() => {
          if (pendingToggle) void handleToggleActive(pendingToggle);
        }}
      >
        {pendingToggle?.active ? (
          <Info tone="warning" title="Se revocará el acceso">
            {pendingToggle.name} no podrá iniciar sesión. El historial de sus acciones se conserva.
          </Info>
        ) : (
          <p className="text-sm text-navy-700">
            Se restaurará el acceso de <strong>{pendingToggle?.name}</strong>.
          </p>
        )}
      </ConfirmActionModal>

      <UserFormModal
        open={modalOpen}
        user={editing}
        isSaving={isSaving}
        error={formError}
        onClose={closeModal}
        onSubmit={(input) => {
          void handleSubmit(input);
        }}
      />

      <Modal
        open={recoveryAction != null}
        title={
          recoveryAction?.action === 'approve' ? 'Aprobar recuperación' : 'Rechazar recuperación'
        }
        onClose={() => {
          if (!recovery.resolvingId) setRecoveryAction(null);
        }}
        dismissible={!recovery.resolvingId}
      >
        {recoveryAction && (
          <div className="space-y-4">
            <p className="text-sm text-navy-700">
              Solicitud de <strong>{recoveryAction.request.user.name}</strong> (
              {recoveryAction.request.user.username}).
            </p>
            {recoveryAction.action === 'approve' ? (
              <>
                <Info tone="warning" title="Verificación obligatoria">
                  Confirme la identidad personalmente o por teléfono. La contraseña temporal se
                  mostrará una sola vez.
                </Info>
                <label className="flex items-start gap-2 text-sm text-navy">
                  <input
                    type="checkbox"
                    checked={identityVerified}
                    onChange={(event) => setIdentityVerified(event.target.checked)}
                  />
                  Verifiqué personalmente o por teléfono la identidad de esta persona.
                </label>
              </>
            ) : (
              <Info tone="warning">
                La solicitud dejará de estar disponible y no cambiará la contraseña.
              </Info>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setRecoveryAction(null)}
                disabled={Boolean(recovery.resolvingId)}
              >
                Cancelar
              </Button>
              <Button
                variant={recoveryAction.action === 'reject' ? 'danger' : 'primary'}
                disabled={recoveryAction.action === 'approve' && !identityVerified}
                busy={Boolean(recovery.resolvingId)}
                onClick={() => void handleResolveRecovery()}
              >
                {recoveryAction.action === 'approve' ? 'Aprobar y generar contraseña' : 'Rechazar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={initialPassword != null}
        title="Contraseña inicial"
        onClose={() => setInitialPassword(null)}
      >
        <div className="space-y-4">
          <Info tone="warning" title="Entrega única">
            Entréguela personalmente. Al cerrar este cuadro no podrá consultarla nuevamente.
          </Info>
          <p
            className="break-all rounded-lg bg-navy-50 p-3 font-mono text-sm"
            data-testid="initial-password"
          >
            {initialPassword}
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setInitialPassword(null)}>Ya la entregué</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={temporaryPassword != null}
        title="Contraseña temporal generada"
        onClose={() => setTemporaryPassword(null)}
      >
        <div className="space-y-4">
          <Info tone="warning" title="Entrega única">
            Entréguela personalmente. Al cerrar este cuadro no podrá consultarla nuevamente.
          </Info>
          <p
            className="break-all rounded-lg bg-navy-50 p-3 font-mono text-sm"
            data-testid="temporary-password"
          >
            {temporaryPassword}
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setTemporaryPassword(null)}>Ya la entregué</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
