import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../features/auth/useAuth';
import { resetDemoData } from '../../mocks/demo-controls';
import { useAppCapabilities } from '../config/CapabilitiesProvider';
import { Button, useToast } from '../ui';
// import { ScenarioRunner } from './ScenarioRunner';

/**
 * Dev-only controls to reset mock data. Never bypasses login — session is cleared on reset.
 */
export function DemoControls() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { pushToast } = useToast();
  const [isResetting, setIsResetting] = useState(false);
  const { prototypeControls } = useAppCapabilities();

  if (!prototypeControls) {
    return null;
  }

  async function finishReset(message: string) {
    await logout();
    pushToast(message, 'success');
    void navigate('/login', { replace: true });
  }

  async function handleReset() {
    setIsResetting(true);
    const result = resetDemoData();

    if (!result.ok) {
      pushToast(result.error.message, 'error');
      setIsResetting(false);
      return;
    }

    await finishReset('Datos demo restaurados. Inicie sesión nuevamente.');
    setIsResetting(false);
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {/* Selector de tipos de escenario + botón "Cargar escenario".
          Para reactivar: descomentar el import de ScenarioRunner (arriba)
          y este bloque. El componente vive en ScenarioRunner.tsx. */}
      {/*
      <ScenarioRunner
        disabled={isResetting}
        onError={(message) => pushToast(message, 'error')}
        onRun={async (message) => {
          await finishReset(message);
        }}
      />
      */}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void handleReset()}
        disabled={isResetting}
      >
        {isResetting ? 'Reiniciando…' : 'Reiniciar datos demo'}
      </Button>
    </div>
  );
}
