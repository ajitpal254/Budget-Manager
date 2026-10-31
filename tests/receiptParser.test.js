const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseReceiptText } = require('../frontend/src/receiptParser.js');

const WALMART = `
WALMART SUPERCENTRE #1234
123 Main St, Toronto ON
Tel: 416-555-0123

Bananas            2.99
Milk 4L            5.49
Bread              3.29
Subtotal          11.77
HST               1.53
TOTAL            $13.30

10/30/2026 14:22
Thank you for shopping!
`;

test('extracts merchant, total-line amount, date, category', () => {
  const r = parseReceiptText(WALMART);
  assert.equal(r.merchant, 'WALMART SUPERCENTRE #1234');
  assert.equal(r.amount, 13.3);
  assert.equal(r.date, '2026-10-30');
  assert.equal(r.category, 'Groceries');
});

test('prefers the last amount on a total line (subtotal vs total)', () => {
  const r = parseReceiptText('Subtotal $10.00  Total $12.50\nSHOP');
  assert.equal(r.amount, 12.5);
});

test('matches balance-due phrasing', () => {
  const r = parseReceiptText('BALANCE DUE: $42.75\nSTORE');
  assert.equal(r.amount, 42.75);
});

test('ignores TOTAL SAVINGS lines when hunting the total', () => {
  const r = parseReceiptText('TOTAL SAVINGS $5.00\nTOTAL $20.00\nSHOP');
  assert.equal(r.amount, 20);
});

test('falls back to the largest $-amount when no total line exists', () => {
  const r = parseReceiptText('Coffee $4.50\nSandwich $9.75\nTip $2.00\nCAFE');
  assert.equal(r.amount, 9.75);
});

test('parses comma thousands', () => {
  const r = parseReceiptText('TOTAL $1,234.56\nSTORE');
  assert.equal(r.amount, 1234.56);
});

test('parses ISO and long-form dates', () => {
  assert.equal(parseReceiptText('Date: 2026-10-30\nSHOP').date, '2026-10-30');
  assert.equal(parseReceiptText('Oct 30, 2026\nSHOP').date, '2026-10-30');
  assert.equal(parseReceiptText('30 Oct 2026\nSHOP').date, '2026-10-30');
});

test('skips junk header lines for the merchant', () => {
  const r = parseReceiptText('RECEIPT\n*** SALE ***\nTim Hortons #8821\nCoffee $2.10');
  assert.equal(r.merchant, 'Tim Hortons #8821');
  assert.equal(r.category, 'Dining');
});

test('category keywords: gas station → Car, pharmacy → Health', () => {
  assert.equal(parseReceiptText('SHELL\nFuel $50.00').category, 'Car');
  assert.equal(parseReceiptText('Shoppers Drug Mart\n$12.99').category, 'Health');
});

test('unknown merchant → null category, not a crash', () => {
  const r = parseReceiptText('XYZ Widget Supply Co\n$10.00');
  assert.equal(r.category, null);
  assert.equal(r.amount, 10);
});

test('garbage text → all null, no throw', () => {
  const r = parseReceiptText('!!! 123 ### $$$');
  assert.deepEqual(r, { merchant: null, amount: null, date: null, category: null });
});

test('empty / null input → all null', () => {
  assert.deepEqual(parseReceiptText(''), { merchant: null, amount: null, date: null, category: null });
  assert.deepEqual(parseReceiptText(null), { merchant: null, amount: null, date: null, category: null });
  assert.deepEqual(parseReceiptText(undefined), { merchant: null, amount: null, date: null, category: null });
});
