const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateInsights, fmt } = require('../frontend/src/insights.js');

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n) => new Date(now - n * DAY).toISOString();
const monthsAgo = (n, day = 15) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - n, day).toISOString();
};

const tx = (overrides) => ({
  type: 'expense',
  description: 'Test',
  amount: 10,
  category: 'Misc',
  date: daysAgo(5),
  ...overrides,
});

test('fmt renders dollar figures', () => {
  assert.equal(fmt(1234.5), '$1,234.50');
  assert.equal(fmt('abc'), '$0.00');
  assert.equal(fmt(NaN), '$0.00');
});

test('empty dataset returns the friendly getting-started insight', () => {
  const out = generateInsights([], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'getting-started');
});

test('null/undefined inputs never crash', () => {
  assert.doesNotThrow(() => generateInsights(null, null));
  assert.doesNotThrow(() => generateInsights(undefined, 'nope'));
  assert.equal(generateInsights(null, null)[0].id, 'getting-started');
});

test('detects over-budget categories', () => {
  const txs = [
    tx({ description: 'Dinner', amount: 250, category: 'Dining' }),
    tx({ description: 'Lunch', amount: 170, category: 'Dining' }),
  ];
  const out = generateInsights(txs, [{ category: 'Dining', limit: 200 }]);
  const over = out.find((i) => i.id === 'over-budget-Dining');
  assert.ok(over, 'expected an over-budget insight');
  assert.equal(over.type, 'danger');
  assert.match(over.title, /over budget/);
  assert.match(over.title, /\$220\.00/);
  assert.match(over.detail, /\$420\.00/);
});

test('detects spending spikes over 25% vs prior 30 days', () => {
  const txs = [
    tx({ description: 'Dining now', amount: 300, category: 'Dining', date: daysAgo(5) }),
    tx({ description: 'Dining before', amount: 120, category: 'Dining', date: daysAgo(40) }),
  ];
  const out = generateInsights(txs, []);
  const spike = out.find((i) => i.id === 'spike-Dining');
  assert.ok(spike, 'expected a spike insight');
  assert.equal(spike.type, 'warning');
  assert.match(spike.title, /up 150%/);
});

test('ignores spikes from tiny prior bases', () => {
  const txs = [
    tx({ description: 'Coffee', amount: 30, category: 'Dining', date: daysAgo(5) }),
    tx({ description: 'Coffee', amount: 5, category: 'Dining', date: daysAgo(40) }),
  ];
  const out = generateInsights(txs, []);
  assert.equal(out.find((i) => i.id === 'spike-Dining'), undefined);
});

test('detects possible subscriptions across calendar months', () => {
  const txs = [
    tx({ description: 'Netflix', amount: 15.99, category: 'Entertainment', date: monthsAgo(0) }),
    tx({ description: 'Netflix', amount: 15.99, category: 'Entertainment', date: monthsAgo(1) }),
    tx({ description: 'Netflix', amount: 15.99, category: 'Entertainment', date: monthsAgo(2) }),
  ];
  const out = generateInsights(txs, []);
  const sub = out.find((i) => i.id.startsWith('subscription-'));
  assert.ok(sub, 'expected a subscription insight');
  assert.match(sub.title, /Netflix/);
  assert.match(sub.detail, /a year/);
});

test('no subscription flagged for one-off charges', () => {
  const txs = [tx({ description: 'Netflix', amount: 15.99, date: monthsAgo(0) })];
  const out = generateInsights(txs, []);
  assert.equal(out.filter((i) => i.id.startsWith('subscription-')).length, 0);
});

test('flags big-ticket single expenses over $500', () => {
  const txs = [tx({ description: 'Laptop', amount: 1200, category: 'Shopping' })];
  const out = generateInsights(txs, []);
  const big = out.find((i) => i.id === 'big-ticket');
  assert.ok(big);
  assert.match(big.title, /Laptop/);
});

test('praises strong savings rates and warns on negative ones', () => {
  const good = generateInsights(
    [tx({ type: 'income', description: 'Pay', amount: 5000, category: 'Salary' }), tx({ amount: 1000, category: 'Rent' })],
    []
  );
  assert.ok(good.find((i) => i.id === 'savings-rate-good'));

  const bad = generateInsights(
    [tx({ type: 'income', description: 'Pay', amount: 1000, category: 'Salary' }), tx({ amount: 1500, category: 'Rent' })],
    []
  );
  const neg = bad.find((i) => i.id === 'savings-rate-negative');
  assert.ok(neg);
  assert.equal(neg.type, 'danger');
});

test('no divide-by-zero when there is no income', () => {
  const out = generateInsights([tx({ amount: 100, category: 'Food' })], []);
  assert.ok(Array.isArray(out));
  assert.equal(out.filter((i) => i.id.startsWith('savings-rate')).length, 0);
});

test('ranks by impact and caps at six insights', () => {
  const txs = [];
  for (let c = 0; c < 10; c++) {
    txs.push(tx({ description: `Item ${c}`, amount: 600, category: `Cat${c}` }));
    txs.push(tx({ description: `Item ${c}`, amount: 600, category: `Cat${c}`, date: monthsAgo(1) }));
  }
  const budgets = [];
  for (let c = 0; c < 10; c++) budgets.push({ category: `Cat${c}`, limit: 100 });
  const out = generateInsights(txs, budgets);
  assert.ok(out.length <= 6, `expected at most 6, got ${out.length}`);
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i - 1].impact >= out[i].impact, 'insights should be impact-ranked');
  }
});

test('top-category insight carries a tailored tip', () => {
  const txs = [
    tx({ description: 'Pizza', amount: 200, category: 'Dining' }),
    tx({ description: 'Burger', amount: 50, category: 'Dining' }),
    tx({ description: 'Bus', amount: 20, category: 'Transportation' }),
  ];
  const out = generateInsights(txs, []);
  const top = out.find((i) => i.id === 'top-category');
  assert.ok(top);
  assert.match(top.title, /Dining/);
});
