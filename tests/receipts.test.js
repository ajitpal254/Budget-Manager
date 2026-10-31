const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_RECEIPT_BYTES,
  isAllowedReceiptType,
  isWithinSizeLimit,
  validateReceiptUpload,
} = require('../lib/receipts');

test('allows common photo types', () => {
  for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']) {
    assert.equal(isAllowedReceiptType(t), true, t);
  }
});

test('type check is case-insensitive', () => {
  assert.equal(isAllowedReceiptType('IMAGE/JPEG'), true);
});

test('rejects SVG (script-in-image XSS risk when served back)', () => {
  assert.equal(isAllowedReceiptType('image/svg+xml'), false);
});

test('rejects non-image types and junk', () => {
  for (const t of ['application/pdf', 'text/plain', '', null, undefined, 42]) {
    assert.equal(isAllowedReceiptType(t), false, String(t));
  }
});

test('size cap is 5 MB and enforced', () => {
  assert.equal(MAX_RECEIPT_BYTES, 5 * 1024 * 1024);
  assert.equal(isWithinSizeLimit(1), true);
  assert.equal(isWithinSizeLimit(MAX_RECEIPT_BYTES), true);
  assert.equal(isWithinSizeLimit(MAX_RECEIPT_BYTES + 1), false);
  assert.equal(isWithinSizeLimit(0), false);
  assert.equal(isWithinSizeLimit(-5), false);
  assert.equal(isWithinSizeLimit(1.5), false);
});

test('validateReceiptUpload accepts a good file', () => {
  const r = validateReceiptUpload({ mimetype: 'image/jpeg', size: 1024 });
  assert.deepEqual(r, { ok: true });
});

test('validateReceiptUpload rejects missing file', () => {
  const r = validateReceiptUpload(undefined);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('validateReceiptUpload rejects disallowed type with 400', () => {
  const r = validateReceiptUpload({ mimetype: 'image/svg+xml', size: 1024 });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.error, /photo/i);
});

test('validateReceiptUpload rejects oversize file with 413', () => {
  const r = validateReceiptUpload({ mimetype: 'image/png', size: MAX_RECEIPT_BYTES + 1 });
  assert.equal(r.ok, false);
  assert.equal(r.status, 413);
  assert.match(r.error, /5 MB/);
});
