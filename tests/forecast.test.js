// Tests for the cash-flow forecast: lib/forecast.js (pure function).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { projectForecast } = require('../lib/forecast');

// Anchor to a fixed date so the tests are deterministic.
const FROM = new Date(2026, 10, 3); // Nov 3, 2026

test('projects monthly recurring income and expenses', () => {
  const recurring = [
    { type: 'income', amount: 1000, frequency: 'monthly', nextRunDate: new Date(2026, 10, 15), active: true },
    { type: 'expense', amount: 200, frequency: 'monthly', nextRunDate: new Date(2026, 10, 10), active: true }
  ];
  const out = projectForecast(recurring, 3, FROM);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((m) => m.key), ['2026-11', '2026-12', '2027-01']);
  for (const m of out) {
    assert.equal(m.income, 1000);
    assert.equal(m.expenses, 200);
    assert.equal(m.net, 800);
  }
});

test('skips inactive entries and invalid types', () => {
  const recurring = [
    { type: 'expense', amount: 50, frequency: 'monthly', nextRunDate: new Date(2026, 10, 10), active: false },
    { type: 'mystery', amount: 999, frequency: 'monthly', nextRunDate: new Date(2026, 10, 10), active: true }
  ];
  const out = projectForecast(recurring, 1, FROM);
  assert.equal(out[0].income, 0);
  assert.equal(out[0].expenses, 0);
});

test('handles weekly frequency (multiple occurrences per month)', () => {
  const recurring = [
    { type: 'expense', amount: 100, frequency: 'weekly', nextRunDate: new Date(2026, 10, 5), active: true }
  ];
  const out = projectForecast(recurring, 1, FROM);
  // Nov 5, 12, 19, 26 -> 4 occurrences
  assert.equal(out[0].expenses, 400);
});

test('clamps months to 1..12', () => {
  assert.equal(projectForecast([], 0, FROM).length, 3); // default
  assert.equal(projectForecast([], 99, FROM).length, 12);
});

test('occurrence exactly at window end is excluded, at start included', () => {
  const recurring = [
    // nextRunDate = Dec 1 2026, monthly; with months=1 the window is Nov only
    { type: 'income', amount: 500, frequency: 'monthly', nextRunDate: new Date(2026, 11, 1), active: true }
  ];
  const out = projectForecast(recurring, 1, FROM);
  assert.equal(out[0].income, 0);
  const out2 = projectForecast(recurring, 2, FROM);
  assert.equal(out2[1].income, 500);
});
