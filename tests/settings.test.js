const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isValidThresholds } = require('../lib/settings');

test('accepts the 80/100 defaults', () => {
  assert.equal(isValidThresholds(80, 100), true);
});

test('accepts any warning strictly below danger', () => {
  assert.equal(isValidThresholds(50, 90), true);
  assert.equal(isValidThresholds(1, 2), true);
});

test('rejects warning equal to or above danger', () => {
  assert.equal(isValidThresholds(90, 90), false);
  assert.equal(isValidThresholds(95, 80), false);
});

test('rejects out-of-range values', () => {
  assert.equal(isValidThresholds(0, 50), false);
  assert.equal(isValidThresholds(10, 101), false);
  assert.equal(isValidThresholds(-5, 200), false);
});

test('rejects non-numeric values', () => {
  assert.equal(isValidThresholds('80', 100), false);
  assert.equal(isValidThresholds(NaN, 100), false);
});

test('unset values fall back to the 80/100 defaults', () => {
  assert.equal(isValidThresholds(undefined, undefined), true);
  assert.equal(isValidThresholds(null, 90), true); // 80 < 90
  assert.equal(isValidThresholds(95, null), true); // 95 < 100
  assert.equal(isValidThresholds(100, null), false); // 100 !< 100
});
