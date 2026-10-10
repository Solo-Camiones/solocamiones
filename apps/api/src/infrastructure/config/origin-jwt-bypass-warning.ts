import type { AppEnvironment, CloudflareAccessConfig } from './runtime-config.js';
import { isDeployedAppEnv } from './runtime-config.js';

export type OriginJwtBypassWarningConfig = {
  appEnv: AppEnvironment;
  appRelease: string | undefined;
  cloudflareAccess: CloudflareAccessConfig | null;
};

type WarningLogger = {
  warn: (bindings: Record<string, unknown>, message: string) => void;
};

/**
 * Temporary CF Access Bypass (requireOriginJwt=false) is only meaningful on
 * deployed envs where Access secrets are loaded; local/test skip this signal.
 */
export function isOriginJwtBypassEnabled(config: OriginJwtBypassWarningConfig): boolean {
  return (
    isDeployedAppEnv(config.appEnv) &&
    config.cloudflareAccess != null &&
    config.cloudflareAccess.requireOriginJwt === false
  );
}

/** Emits an operational warning so a temporary origin JWT bypass is not left enabled. */
export function warnIfOriginJwtBypassEnabled(
  config: OriginJwtBypassWarningConfig,
  log: WarningLogger,
): void {
  if (!isOriginJwtBypassEnabled(config)) {
    return;
  }

  log.warn(
    {
      appEnv: config.appEnv,
      release: config.appRelease,
    },
    'Cloudflare Access origin JWT verification is disabled (CF_ACCESS_REQUIRE_ORIGIN_JWT=false); restore true after coordinated Bypass is removed',
  );
}
