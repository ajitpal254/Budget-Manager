// Structured application logger (pino).
//
// - Production: single-line JSON on stdout (Render's log tail can parse it).
// - Development: same JSON — pipe through `npx pino-pretty` locally for color.
// - Level via LOG_LEVEL env, defaulting to 'info' in production, 'debug' otherwise.
// - Redacts sensitive fields so secrets never land in logs.
//
// Usage: const logger = require('./logger'); logger.info({ reqId }, 'message');
// For tests: const { createLogger } = require('./logger');
//            const l = createLogger(captureStream);

const pino = require('pino');

const isProd = process.env.NODE_ENV === 'production';

const REDACT_PATHS = [
  'password',
  'newPassword',
  'currentPassword',
  'req.headers.cookie',
  'req.headers.authorization',
  'headers.cookie',
  'headers.authorization',
  '*.password',
];

function loggerOptions() {
  return {
    level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
    // ISO timestamps; Render shows its own too, but ours survive log drains.
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    // In production, keep the base fields minimal for smaller log lines.
    base: isProd ? { pid: process.pid } : undefined,
  };
}

function createLogger(stream) {
  return stream ? pino(loggerOptions(), stream) : pino(loggerOptions());
}

const logger = createLogger();

module.exports = logger;
module.exports.createLogger = createLogger;
module.exports.loggerOptions = loggerOptions;
module.exports.REDACT_PATHS = REDACT_PATHS;
