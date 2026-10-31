const { test } = require('node:test');
const assert = require('node:assert/strict');
const { answerQuestion } = require('../frontend/src/assistant.js');

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n) => new Date(now - n * DAY).toISOString();

const txs = [
  { type: 'income', description: 'Salary', amount: 5000, category: 'Contract Income', date: daysAgo(5) },
  { type: 'expense', description: 'Weekly shop', amount: 120, category: 'Groceries', date: daysAgo(3) },
  { type: 'expense', description: 'Dinner', amount: 60, category: 'Dining', date: daysAgo(2) },
];
const budgets = [{ category: 'Dining', limit: 50 }];
const ctx = { transactions: txs, budgets };

test('routes how-to questions to the knowledge base', () => {
  const a = answerQuestion('How do I add a recurring transaction?', ctx);
  assert.match(a, /Recurring/i);
  assert.match(a, /Transactions tab/);
});

test('answers export how-to', () => {
  const a = answerQuestion('how do i export my data', ctx);
  assert.match(a, /Export CSV/i);
});

test('answers data questions with computed figures', () => {
  const a = answerQuestion('How much did I spend on groceries?', ctx);
  assert.match(a, /\$120\.00/);
});

test('reports the biggest expense', () => {
  const a = answerQuestion('What is my biggest expense?', ctx);
  assert.match(a, /Weekly shop/);
  assert.match(a, /\$120\.00/);
});

test('summarizes top insights for cost-cutting questions', () => {
  const a = answerQuestion('How can I cut costs?', ctx);
  assert.match(a, /Dining/);
  assert.ok(!/\[|\]\(/.test(a), 'no markdown expected');
});

test('handles "where did my money go this month"', () => {
  const a = answerQuestion('Where did my money go this month?', ctx);
  assert.match(a, /\$180\.00/);
  assert.match(a, /Groceries/);
});

test('greets politely', () => {
  const a = answerQuestion('hello', ctx);
  assert.match(a, /Hi!/);
});

test('thanks politely', () => {
  const a = answerQuestion('thanks!', ctx);
  assert.match(a, /welcome/i);
});

test('falls back with example questions', () => {
  const a = answerQuestion('blargle wargle zzz', ctx);
  assert.match(a, /How can I cut costs/);
});

test('handles empty input and missing context gracefully', () => {
  assert.doesNotThrow(() => answerQuestion('', {}));
  assert.doesNotThrow(() => answerQuestion('how much did i spend on x?', {}));
  const a = answerQuestion('how much did i spend on x?', {});
  assert.match(a, /none yet|find/i);
});

test('answers stay short and plain-text', () => {
  const samples = [
    'How can I cut costs?',
    'How much did I spend on groceries?',
    'How do I enable push notifications?',
    'am i over budget?',
  ];
  for (const s of samples) {
    const a = answerQuestion(s, ctx);
    assert.ok(a.length < 900, `too long: ${s}`);
    assert.ok(!a.includes('**') && !a.includes('##'), `markdown in: ${s}`);
  }
});
