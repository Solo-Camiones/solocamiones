import pino from 'pino';

const DEFAULT_LOG_LEVEL = 'info';
const TEST_LOG_LEVEL = 'silent';

function resolveLogLevel(): string {
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL;
  }

  if (process.env.NODE_ENV === 'test') {
    return TEST_LOG_LEVEL;
  }

  return DEFAULT_LOG_LEVEL;
}

export const logger = pino({
  level: resolveLogLevel(),
  redact: {
    paths: [
      'password',
      'passwordHash',
      '*.password',
      'req.headers.authorization',
      'req.headers.cookie',
      'apiKey',
      'EXCHANGE_RATE_API_KEY',
      '*.apiKey',
    ],
    censor: '[Redacted]',
  },
});
