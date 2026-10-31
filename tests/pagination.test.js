const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePagination, DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT } = require('../lib/pagination');

test('missing params fall back to defaults', () => {
  assert.deepEqual(parsePagination(undefined, undefined), { page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
});

test('garbage strings fall back to defaults', () => {
  assert.deepEqual(parsePagination('abc', 'xyz'), { page: 1, limit: 20 });
});

test('zero and negative values fall back to defaults', () => {
  assert.deepEqual(parsePagination('0', '-5'), { page: 1, limit: 20 });
});

test('valid values pass through', () => {
  assert.deepEqual(parsePagination('3', '50'), { page: 3, limit: 50 });
});

test('limit is clamped to MAX_LIMIT', () => {
  const { limit } = parsePagination('1', '99999');
  assert.equal(limit, MAX_LIMIT);
  assert.ok(MAX_LIMIT === 100);
});

test('limit at exactly MAX_LIMIT is kept', () => {
  assert.equal(parsePagination('2', '100').limit, 100);
});
