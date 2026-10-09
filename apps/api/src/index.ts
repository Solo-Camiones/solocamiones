import './infrastructure/config/load-env.js';

import { createApp } from './app.js';
import { parseRuntimeConfig } from './infrastructure/config/index.js';
import { disconnectPrisma } from './infrastructure/database/index.js';
import { logger } from './infrastructure/logging/index.js';

const config = parseRuntimeConfig();

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
