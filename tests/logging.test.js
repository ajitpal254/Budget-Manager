// Tests for structured logging: lib/logger.js and middleware/requestLog.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const logger = require('../lib/logger');
const { createLogger } = require('../lib/logger');
const { requestId, requestLog } = require('../middleware/requestLog');

test('logger exposes the pino levels we use', () => {
  for (const m of ['info', 'warn', 'error', 'debug', 'fatal', 'child']) {
    assert.equal(typeof logger[m], 'function', `logger.${m} should exist`);
  }
});

test('logger redacts passwords (never log secrets)', () => {
  const out = [];
  const l = createLogger({ write: (s) => out.push(s) });
  l.info({ password: 'hunter2', user: 'ajit' }, 'login attempt');
  const line = JSON.parse(out.join(''));
  assert.equal(line.password, '[REDACTED]');
  assert.equal(line.user, 'ajit');
});

test('requestId assigns a UUID, sets the header, and attaches req.log', () => {
  const req = { headers: {} };
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  let nexted = false;
  requestId(req, res, () => { nexted = true; });

  assert.ok(nexted);
  assert.match(req.id, /^[0-9a-f-]{36}$/i, 'req.id should be a UUID');
  assert.equal(headers['x-request-id'], req.id);
  assert.equal(typeof req.log.info, 'function', 'req.log should be a pino child');
});

test('requestId honors an incoming x-request-id (trace stays joined)', () => {
  const req = { headers: { 'x-request-id': 'abc-123' } };
  const res = { setHeader: () => {} };
  requestId(req, res, () => {});
  assert.equal(req.id, 'abc-123');
});

test('requestLog logs method/url/status/duration on response finish', () => {
  const lines = [];
  const testLogger = createLogger({ write: (s) => lines.push(s) });

  const req = { method: 'GET', originalUrl: '/api/test', log: testLogger, id: 'test-id' };
  const res = new EventEmitter();
  res.statusCode = 200;
  let nexted = false;
  requestLog(req, res, () => { nexted = true; });
  assert.ok(nexted, 'should call next()');

  res.emit('finish');
  assert.equal(lines.length, 1);
  const line = JSON.parse(lines[0]);
  assert.equal(line.method, 'GET');
  assert.equal(line.url, '/api/test');
  assert.equal(line.status, 200);
  assert.equal(typeof line.durationMs, 'number');
  assert.equal(line.msg, 'request completed');
});
