import './infrastructure/config/load-env.js';

import { createApp } from './app.js';
import { isDeployedAppEnv, parseRuntimeConfig } from './infrastructure/config/index.js';
import { disconnectPrisma } from './infrastructure/database/index.js';
import { logger } from './infrastructure/logging/index.js';

const config = parseRuntimeConfig();

if (
  isDeployedAppEnv(config.appEnv) &&
  config.cloudflareAccess != null &&
  config.cloudflareAccess.requireOriginJwt === false
) {
  logger.warn(
    {
      appEnv: config.appEnv,
      release: config.appRelease,
    },
    'Cloudflare Access origin JWT verification is disabled (CF_ACCESS_REQUIRE_ORIGIN_JWT=false); restore true after coordinated Bypass is removed',
  );
}

const app = createApp({
  trustProxy: config.trustProxy,
  allowedHosts: config.allowedHosts,
  cloudflareAccess: config.cloudflareAccess,
  assistantConfig: config.assistant,
});

const server = app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      appEnv: config.appEnv,
      release: config.appRelease,
    },
    'API listening',
  );
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal, release: config.appRelease }, 'Shutting down gracefully');

  server.close(async () => {
    try {
      await disconnectPrisma();
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during Prisma disconnect');
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
