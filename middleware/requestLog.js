// Request ID + access logging middleware.
//
// - requestId: assigns every request a UUID (req.id), returned as the
//   `x-request-id` response header so a user bug report can be correlated
//   with server logs. Attaches req.log, a pino child logger bound to the ID.
// - requestLog: logs one line per completed request (method, url, status,
//   duration). Mount after routes that should be logged.

const crypto = require('crypto');
const logger = require('../lib/logger');

function requestId(req, res, next) {
  // Honor an incoming ID (e.g. from a retry) so the trace stays joined.
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  req.log = logger.child({ reqId: id });
  next();
}

function requestLog(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    (req.log || logger).info(
      {
        method: req.method,
        url: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      },
      'request completed'
    );
  });
  next();
}

module.exports = { requestId, requestLog };
