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

function resolveRelease(): string | undefined {
  const raw = process.env.APP_RELEASE?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

export const logger = pino({
  level: resolveLogLevel(),
  base: {
    release: resolveRelease(),
  },
  redact: {
    paths: [
      'password',
      'passwordHash',
      '*.password',
      'req.headers.authorization',
      'req.headers.cookie',
      `req.headers['cf-access-jwt-assertion']`,
      'apiKey',
      'EXCHANGE_RATE_API_KEY',
      'OPENAI_API_KEY',
      'DATABASE_URL',
      'INITIAL_PASSWORD',
      'METRICS_BEARER_TOKEN',
      'CF_ACCESS_AUD',
      '*.apiKey',
      '*.OPENAI_API_KEY',
      '*.DATABASE_URL',
      '*.METRICS_BEARER_TOKEN',
    ],
    censor: '[Redacted]',
  },
});
