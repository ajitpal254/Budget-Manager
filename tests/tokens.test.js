const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashToken } = require('../lib/tokens');

test('hashToken is deterministic for the same input', () => {
  assert.equal(hashToken('session-token-abc'), hashToken('session-token-abc'));
});

test('hashToken differs for different inputs', () => {
  assert.notEqual(hashToken('token-one'), hashToken('token-two'));
});

test('hashToken returns a 64-char lowercase hex digest (SHA-256)', () => {
  assert.match(hashToken('anything'), /^[0-9a-f]{64}$/);
});

test('hashToken coerces non-string input the same as its string form', () => {
  assert.equal(hashToken(12345), hashToken('12345'));
});

test('hashToken never returns an empty digest', () => {
  assert.ok(hashToken('').length === 64);
});
