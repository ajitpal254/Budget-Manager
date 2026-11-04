// Tests for budget rollover math: lib/rollover.js (pure functions).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { computeRollover, monthKey, prevMonthKey } = require('../lib/rollover');

test('monthKey and prevMonthKey', () => {
  assert.equal(monthKey(new Date(2026, 10, 15)), '2026-11');
  assert.equal(prevMonthKey('2026-11'), '2026-10');
  assert.equal(prevMonthKey('2026-01'), '2025-12');
});

test('unspent budget rolls over', () => {
  const budgets = [{ category: 'Groceries', limit: 500, rollover: true }];
  const txs = [
    { type: 'expense', category: 'Groceries', amount: 300, date: new Date(2026, 9, 10) } // Oct
  ];
  const out = computeRollover(budgets, txs, '2026-11');
  assert.deepEqual(out, { Groceries: 200 });
});

test('overspent budget rolls over zero (never negative)', () => {
  const budgets = [{ category: 'Dining', limit: 200, rollover: true }];
  const txs = [
    { type: 'expense', category: 'Dining', amount: 350, date: new Date(2026, 9, 5) }
  ];
  const out = computeRollover(budgets, txs, '2026-11');
  assert.deepEqual(out, { Dining: 0 });
});

test('budgets without rollover are excluded', () => {
  const budgets = [
    { category: 'Groceries', limit: 500, rollover: false },
    { category: 'Dining', limit: 200 } // undefined rollover
  ];
  const txs = [
    { type: 'expense', category: 'Groceries', amount: 100, date: new Date(2026, 9, 5) }
  ];
  const out = computeRollover(budgets, txs, '2026-11');
  assert.deepEqual(out, {});
});

test('only the previous month counts (not older, not current)', () => {
  const budgets = [{ category: 'Groceries', limit: 500, rollover: true }];
  const txs = [
    { type: 'expense', category: 'Groceries', amount: 400, date: new Date(2026, 7, 5) },  // Aug — ignored
    { type: 'expense', category: 'Groceries', amount: 300, date: new Date(2026, 9, 5) },  // Oct — counts
    { type: 'expense', category: 'Groceries', amount: 100, date: new Date(2026, 10, 2) }  // Nov — ignored
  ];
  const out = computeRollover(budgets, txs, '2026-11');
  assert.deepEqual(out, { Groceries: 200 });
});

test('income transactions never reduce the rollover', () => {
  const budgets = [{ category: 'Salary', limit: 1000, rollover: true }];
  const txs = [
    { type: 'income', category: 'Salary', amount: 5000, date: new Date(2026, 9, 1) }
  ];
  const out = computeRollover(budgets, txs, '2026-11');
  assert.deepEqual(out, { Salary: 1000 });
});
