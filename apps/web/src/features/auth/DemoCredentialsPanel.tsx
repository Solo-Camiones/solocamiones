import { roleLabel } from '../../shared/auth/policies';
import { DEMO_CREDENTIALS } from '../../shared/config/demo-credentials';
import { Mono } from '../../shared/ui';

/**
 * Compact reference panel for seed credentials — visible for copy, not auto-login buttons.
 */
export function DemoCredentialsPanel() {
  return (
    <aside
      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white/70"
      aria-label="Usuarios de prueba"
    >
      <p className="mb-2 text-center font-medium text-white/90">Usuarios de prueba</p>

      <ul className="space-y-1">
        {DEMO_CREDENTIALS.map((user) => (
          <li
            key={user.id}
            className="flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-0.5"
          >
            <span className="text-white/50">{roleLabel(user.role)}:</span>
            <Mono className="text-white/90">{user.username}</Mono>
            <span className="text-white/40">/</span>
            <Mono className="text-white/90">{user.password}</Mono>
          </li>
        ))}
      </ul>
    </aside>
  );
}
