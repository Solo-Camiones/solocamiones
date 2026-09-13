import { useState } from 'react';

import type { UpdateOwnProfileInput } from '../../api/contracts/profile';
import { PageHeader } from '../../shared/layout/PageHeader';
import { Info, useToast } from '../../shared/ui';
import { ProfileForm } from './ProfileForm';
import { useProfile } from './useProfile';
import { useMockApi } from '../../api/client/http-client';

export function ProfilePage() {
  const { user, isSaving, save } = useProfile();
  const { pushToast } = useToast();
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  async function handleSubmit(input: UpdateOwnProfileInput) {
    setError(null);
    const response = await save(input);

    if (!response.ok) {
      setError(response.error.message);
      return;
    }

    pushToast(
      !useMockApi && input.newPassword !== undefined
        ? 'Contraseña actualizada. Inicie sesión con su nueva contraseña.'
        : 'Perfil actualizado',
      'success',
    );
  }

  return (
    <>
      <PageHeader
        title="Mi perfil"
        description="Nombre y datos de contacto."
      />
      <div className="space-y-4">
        {user.mustChangePassword && (
          <Info tone="warning" title="Debe cambiar su contraseña">
            Esta cuenta usa una contraseña inicial o temporal. Cámbiela en esta página para poder
            usar el resto del sistema. Mínimo 6 caracteres y distinta de la actual.
          </Info>
        )}
        <Info tone="info" title="Datos de acceso">
          El nombre de usuario no se puede cambiar desde aquí. Solo un administrador puede asignar
          rol o desactivar la cuenta.
        </Info>
      </div>
      <div className="mt-6">
        <ProfileForm user={user} isSaving={isSaving} error={error} onSubmit={handleSubmit} />
      </div>
    </>
  );
}
