import './infrastructure/config/load-env.js';

import { getInitialPassword } from './features/users/service.js';
import { createApp } from './app.js';
import { disconnectPrisma } from './infrastructure/database/index.js';
import { logger } from './infrastructure/logging/index.js';
import { parseAssistantConfig } from './infrastructure/openai/index.js';

const DEFAULT_PORT = 3000;

const port = Number(process.env.PORT ?? DEFAULT_PORT);

// Validate assistant env at boot; createApp wires gateways (fakes when disabled).
parseAssistantConfig();
getInitialPassword();

const app = createApp();

const server = app.listen(port, () => {
  logger.info({ port }, 'API listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully');

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
