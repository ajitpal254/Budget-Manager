// Cash-flow forecast: project recurring transactions into future months.
//
// Pure function (no DB) so it is easy to test. Given the user's active
// recurring entries, it steps each one's nextRunDate forward with the same
// addFrequency() the materializer uses, and buckets every occurrence that
// falls inside the forecast window by calendar month.

const { addFrequency } = require('./recurring');

const round2 = (n) => Math.round(n * 100) / 100;

// recurringTxs: array of { type, amount, frequency, nextRunDate, active }
// months: how many months to project (default 3)
// fromDate: anchor date; the window starts at the 1st of its month
// Returns: [{ key: '2026-11', label: 'Nov', year, month, income, expenses, net }]
const projectForecast = (recurringTxs, months = 3, fromDate = new Date()) => {
  const count = Math.max(1, Math.min(12, Math.floor(months) || 3));
  const windowStart = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const windowEnd = new Date(windowStart.getFullYear(), windowStart.getMonth() + count, 1);

  const buckets = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      income: 0,
      expenses: 0
    });
  }
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));

  for (const rt of recurringTxs) {
    if (!rt || !rt.active) continue;
    if (rt.type !== 'income' && rt.type !== 'expense') continue;
    let occ = new Date(rt.nextRunDate);
    if (Number.isNaN(occ.getTime())) continue;
    // Iteration cap guards against pathological nextRunDate values.
    let guard = 0;
    while (occ < windowEnd && guard++ < 500) {
      if (occ >= windowStart) {
        const key = `${occ.getFullYear()}-${String(occ.getMonth() + 1).padStart(2, '0')}`;
        const bucket = byKey[key];
        if (bucket) {
          if (rt.type === 'income') bucket.income += rt.amount;
          else bucket.expenses += rt.amount;
        }
      }
      occ = addFrequency(occ, rt.frequency);
    }
  }

  return buckets.map((b) => ({
    ...b,
    income: round2(b.income),
    expenses: round2(b.expenses),
    net: round2(b.income - b.expenses)
  }));
};

module.exports = { projectForecast };
