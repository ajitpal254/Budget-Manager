// Tests for bill reminder selection: lib/billReminders.js findDueBills (pure).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { findDueBills, REMINDER_WINDOW_DAYS } = require('../lib/billReminders');

const NOW = new Date(2026, 10, 3, 12, 0, 0); // Nov 3, 2026 noon
const inDays = (n) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

test('finds bills due within the window', () => {
  const bills = [
    { active: true, type: 'expense', description: 'Rent', amount: 650, nextRunDate: inDays(2) },
    { active: true, type: 'expense', description: 'Far', amount: 10, nextRunDate: inDays(10) },
    { active: true, type: 'expense', description: 'Past', amount: 10, nextRunDate: inDays(-1) }
  ];
  const out = findDueBills(bills, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].description, 'Rent');
});

test('skips income, inactive, and already-reminded-today bills', () => {
  const bills = [
    { active: true, type: 'income', description: 'Pay', amount: 100, nextRunDate: inDays(1) },
    { active: false, type: 'expense', description: 'Off', amount: 100, nextRunDate: inDays(1) },
    { active: true, type: 'expense', description: 'Done', amount: 100, nextRunDate: inDays(1), lastReminderSent: NOW }
  ];
  assert.deepEqual(findDueBills(bills, NOW), []);
});

test('reminds again the next day (dedup is per-day)', () => {
  const bills = [
    {
      active: true, type: 'expense', description: 'Ins', amount: 300,
      nextRunDate: inDays(1), lastReminderSent: inDays(-1)
    }
  ];
  const out = findDueBills(bills, NOW);
  assert.equal(out.length, 1);
});

test('window is 3 days inclusive of the boundary', () => {
  assert.equal(REMINDER_WINDOW_DAYS, 3);
  const bills = [
    { active: true, type: 'expense', description: 'Edge', amount: 5, nextRunDate: inDays(3) },
    { active: true, type: 'expense', description: 'Over', amount: 5, nextRunDate: inDays(4) }
  ];
  const out = findDueBills(bills, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].description, 'Edge');
});
