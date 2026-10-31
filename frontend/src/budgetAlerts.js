// Shared budget-alert math: per-category spend vs. the configured limit.
// Used by the Budgets view, the Dashboard alert summary, and the toast
// notifications fired from App when a threshold is crossed.
//
// Thresholds are parameters (defaulting to the app-wide 80/100) so the
// user's own settings can be plugged in without touching call sites that
// don't have them.

export const WARNING_THRESHOLD = 80;
export const DANGER_THRESHOLD = 100;

export function computeBudgetStatus(
  budgets,
  transactions,
  warningPct = WARNING_THRESHOLD,
  dangerPct = DANGER_THRESHOLD
) {
  const spends = {};
  transactions.forEach(t => {
    if (t.type === 'expense') {
      const cat = (t.category || '').trim();
      spends[cat] = (spends[cat] || 0) + t.amount;
    }
  });

  return budgets.map(b => {
    const category = (b.category || '').trim();
    const spent = spends[category] || 0;
    const percent = b.limit > 0 ? (spent / b.limit) * 100 : 0;
    const status =
      percent >= dangerPct ? 'danger'
      : percent >= warningPct ? 'warning'
      : 'ok';
    return { budget: b, spent, percent, status };
  });
}
