const { test } = require('node:test');
const assert = require('node:assert/strict');
const { addFrequency, isValidFrequency } = require('../lib/recurring');

const isoDate = (d) => d.toISOString().slice(0, 10);

test('weekly adds 7 days', () => {
  assert.equal(isoDate(addFrequency(new Date('2026-01-15T12:00:00Z'), 'weekly')), '2026-01-22');
});

test('biweekly adds 14 days', () => {
  assert.equal(isoDate(addFrequency(new Date('2026-01-15T12:00:00Z'), 'biweekly')), '2026-01-29');
});

test('monthly clamps month-end (Jan 31 -> Feb 28)', () => {
  assert.equal(isoDate(addFrequency(new Date('2026-01-31T12:00:00Z'), 'monthly')), '2026-02-28');
});

test('monthly keeps the day mid-month', () => {
  assert.equal(isoDate(addFrequency(new Date('2026-03-15T12:00:00Z'), 'monthly')), '2026-04-15');
});

test('yearly clamps Feb 29 to Feb 28 on non-leap years', () => {
  assert.equal(isoDate(addFrequency(new Date('2024-02-29T12:00:00Z'), 'yearly')), '2025-02-28');
});

test('yearly keeps normal dates', () => {
  assert.equal(isoDate(addFrequency(new Date('2026-06-10T12:00:00Z'), 'yearly')), '2027-06-10');
});

test('unknown frequency throws', () => {
  assert.throws(() => addFrequency(new Date(), 'daily'), /Unknown frequency/);
});

test('isValidFrequency accepts the four frequencies only', () => {
  assert.equal(isValidFrequency('weekly'), true);
  assert.equal(isValidFrequency('biweekly'), true);
  assert.equal(isValidFrequency('monthly'), true);
  assert.equal(isValidFrequency('yearly'), true);
  assert.equal(isValidFrequency('daily'), false);
  assert.equal(isValidFrequency(''), false);
});
