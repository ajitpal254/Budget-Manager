// Budget rollover: carry unspent budget into the next month.
//
// Single-level rollover (kept deliberately simple and predictable): for
// target month M, rollover[category] = max(0, limit - spent in M-1), but only
// for budgets with rollover=true. The effective limit for M is then
// limit + rollover[category].
//
// Pure functions (no DB) so they are easy to test.

const monthKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};

// Previous calendar month's key for a 'YYYY-MM' target key.
const prevMonthKey = (targetKey) => {
  const [y, m] = targetKey.split('-').map(Number);
  const d = new Date(y, m - 2, 1); // m is 1-based; Date months are 0-based
  return monthKey(d);
};

const round2 = (n) => Math.round(n * 100) / 100;

// budgets: [{ category, limit, rollover }]
// transactions: [{ type, category, amount, date }]
// targetKey: 'YYYY-MM' — the month the rollover applies TO
// Returns: { [category]: rolloverAmount } (only for rollover-enabled budgets)
const computeRollover = (budgets, transactions, targetKey) => {
  const prevKey = prevMonthKey(targetKey);
  const result = {};
  for (const b of budgets) {
    if (!b || !b.rollover) continue;
    const spent = transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          t.category === b.category &&
          monthKey(t.date) === prevKey
      )
      .reduce((sum, t) => sum + t.amount, 0);
    result[b.category] = Math.max(0, round2(b.limit - spent));
  }
  return result;
};

module.exports = { computeRollover, monthKey, prevMonthKey };
