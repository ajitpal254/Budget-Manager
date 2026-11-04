// Tests for the monthly PDF report: lib/monthlyReport.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildMonthlyReport } = require('../lib/monthlyReport');

const txs = [
  { type: 'income', description: 'Salary', amount: 5000, category: 'Income', date: new Date(2026, 10, 1) },
  { type: 'expense', description: 'Rent', amount: 1500, category: 'Housing', date: new Date(2026, 10, 2) },
  { type: 'expense', description: 'Groceries', amount: 300, category: 'Groceries', date: new Date(2026, 10, 5) }
];
const budgets = [{ category: 'Groceries', limit: 400 }];

test('produces a valid PDF buffer', async () => {
  const pdf = await buildMonthlyReport({ monthLabel: 'November 2026', transactions: txs, budgets });
  assert.ok(Buffer.isBuffer(pdf), 'should be a Buffer');
  assert.ok(pdf.length > 500, 'should have real content');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', 'should start with the PDF magic bytes');
});

test('handles an empty month without throwing', async () => {
  const pdf = await buildMonthlyReport({ monthLabel: 'November 2026', transactions: [], budgets: [] });
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});
