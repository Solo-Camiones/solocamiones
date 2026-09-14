import { APP_NAME } from '../../shared/config/brand';
import { useAppCapabilities } from '../../shared/config/CapabilitiesProvider';
import { Logo, Mono } from '../../shared/ui';
import { DemoCredentialsPanel } from './DemoCredentialsPanel';
import { LoginForm } from './LoginForm';
import { RecoveryRequestForm } from './RecoveryRequestForm';
import { useMockApi } from '../../api/client/http-client';
import { readDemoLoginHint } from '../../mocks/demo-controls';

export function LoginPage() {
  const { prototypeControls } = useAppCapabilities();
  const hint = prototypeControls ? readDemoLoginHint() : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-shell px-4 py-10 text-white">
      <div className="w-full max-w-sm space-y-5">
        <header className="space-y-4 text-center">
          <Logo size="lg" className="mx-auto" />
          <div>
            <h1 className="text-2xl font-bold tracking-[0.18em] text-white">{APP_NAME}</h1>
            <p className="mt-2 text-sm text-white/70">Inicie sesión con usuario y contraseña.</p>
          </div>
        </header>

        {hint && (
          <aside className="rounded-lg border border-brand/40 bg-brand/15 px-3 py-2.5 text-xs text-white/90">
            <p className="font-medium text-white">Escenario: {hint.title}</p>
            <p className="mt-1">
              Use <Mono className="text-white">{hint.suggestedUsername}</Mono> /{' '}
              <Mono className="text-white">{hint.suggestedPassword}</Mono>
            </p>
            <p className="mt-1 text-white/70">{hint.nextSteps}</p>
          </aside>
        )}

        <div className="rounded-xl border border-shell-border bg-white p-6 shadow-lg">
          <LoginForm />
          {!useMockApi && <RecoveryRequestForm />}
        </div>

        {prototypeControls && <DemoCredentialsPanel />}
      </div>
    </div>
  );
}
