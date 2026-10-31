// Smart insights engine — pure functions over the user's own transaction data.
//
// No network calls, no dependencies, no JSX: safe to import from node:test
// as well as from the React UI. All money figures are rendered as $ strings.

export function fmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '$0.00';
  return (
    '$' +
    v.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

function validTransactions(transactions) {
  if (!Array.isArray(transactions)) return [];
  return transactions.filter(
    (t) =>
      t &&
      (t.type === 'income' || t.type === 'expense') &&
      Number.isFinite(Number(t.amount)) &&
      Number(t.amount) >= 0
  );
}

function amount(t) {
  return Number(t.amount) || 0;
}

function categoryOf(t) {
  const c = (t.category || '').trim();
  return c === '' ? 'Uncategorized' : c;
}

function txDate(t) {
  const d = new Date(t.date);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const CATEGORY_TIPS = {
  dining:
    'Cooking at home just two more nights a week usually cuts this noticeably.',
  groceries:
    'A weekly meal plan plus a strict shopping list typically trims grocery bills by 10–15%.',
  shopping:
    'Try a 48-hour rule before non-essential purchases — most urges pass.',
  transportation:
    'Combining errands into fewer trips (or carpooling) saves real fuel money.',
  utilities:
    'Worth a quick review of your plan, thermostat and standby devices.',
  'eating out':
    'Cooking at home just two more nights a week usually cuts this noticeably.',
};

// generateInsights(transactions, budgets) -> [{ id, type, title, detail, impact }]
// Ranked by importance (impact desc), capped at 6. Never throws on bad input.
export function generateInsights(transactions, budgets) {
  const txs = validTransactions(transactions);
  const expenses = txs.filter((t) => t.type === 'expense');
  const insights = [];

  if (expenses.length === 0) {
    return [
      {
        id: 'getting-started',
        type: 'info',
        title: 'Not enough data yet',
        detail:
          'Add a few transactions and I’ll start spotting concrete ways to save money.',
        impact: 0,
      },
    ];
  }

  const now = new Date();
  const inLastDays = (t, days) => {
    const d = txDate(t);
    return d !== null && d <= now && now - d <= days * DAY_MS;
  };
  const last30 = txs.filter((t) => inLastDays(t, 30));
  const prev30 = txs.filter(
    (t) => {
      const d = txDate(t);
      return d !== null && d <= now && now - d > 30 * DAY_MS && now - d <= 60 * DAY_MS;
    }
  );
  const last90 = txs.filter((t) => inLastDays(t, 90));

  // 1. Over budget — spend vs. budget limit per category.
  const spendByCat = {};
  expenses.forEach((t) => {
    const c = categoryOf(t);
    spendByCat[c] = (spendByCat[c] || 0) + amount(t);
  });
  const safeBudgets = Array.isArray(budgets) ? budgets : [];
  safeBudgets.forEach((b) => {
    if (!b) return;
    const cat = (b.category || '').trim();
    const limit = Number(b.limit);
    if (cat === '' || !Number.isFinite(limit) || limit <= 0) return;
    const spent = spendByCat[cat] || 0;
    if (spent > limit) {
      insights.push({
        id: `over-budget-${cat}`,
        type: 'danger',
        title: `${cat} is ${fmt(spent - limit)} over budget`,
        detail: `You've spent ${fmt(spent)} against a ${fmt(limit)} ${cat} budget. Pausing non-essential ${cat} spending for the rest of the period is the fastest fix.`,
        impact: 100 + (spent - limit),
      });
    }
  });

  // 2. Spending spike — category up >25% vs the prior 30-day window.
  const sumByCat = (list) => {
    const m = {};
    list
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        const c = categoryOf(t);
        m[c] = (m[c] || 0) + amount(t);
      });
    return m;
  };
  const catLast = sumByCat(last30);
  const catPrev = sumByCat(prev30);
  Object.keys(catLast).forEach((c) => {
    const cur = catLast[c];
    const prev = catPrev[c] || 0;
    if (prev >= 20 && cur > prev * 1.25) {
      const pct = Math.round(((cur - prev) / prev) * 100);
      insights.push({
        id: `spike-${c}`,
        type: 'warning',
        title: `${c} spending is up ${pct}%`,
        detail: `${fmt(cur)} in the last 30 days vs ${fmt(prev)} the 30 days before. Worth checking what's driving the jump.`,
        impact: 70 + pct,
      });
    }
  });

  // 3. Possible subscription — same description + amount in 2+ of the last 3 calendar months.
  const recentMonths = [];
  for (let i = 0; i < 3; i++) {
    recentMonths.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  const seenMonths = {};
  expenses.forEach((t) => {
    const d = txDate(t);
    if (d === null) return;
    const mk = monthKey(d);
    if (!recentMonths.includes(mk)) return;
    const desc = (t.description || '').trim().toLowerCase();
    if (desc === '') return;
    const key = `${desc}|${amount(t).toFixed(2)}`;
    if (!seenMonths[key]) seenMonths[key] = new Set();
    seenMonths[key].add(mk);
  });
  Object.keys(seenMonths).forEach((key) => {
    const months = seenMonths[key].size;
    if (months >= 2) {
      const [desc, amtStr] = key.split('|');
      const amt = Number(amtStr);
      const pretty = desc.charAt(0).toUpperCase() + desc.slice(1);
      insights.push({
        id: `subscription-${key}`,
        type: 'info',
        title: `Possible subscription: ${pretty} (${fmt(amt)}/mo)`,
        detail: `This exact charge appeared in ${months} of the last 3 months. If you no longer use it, cancelling saves about ${fmt(amt * 12)} a year.`,
        impact: 55,
      });
    }
  });

  // 4. Top spending category (last 90 days) with a tailored tip.
  const exp90 = last90.filter((t) => t.type === 'expense');
  const total90 = exp90.reduce((s, t) => s + amount(t), 0);
  if (total90 > 0) {
    const byCat = sumByCat(last90);
    const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    if (entries.length > 0) {
      const [topCat, topAmt] = entries[0];
      const share = Math.round((topAmt / total90) * 100);
      const tip =
        CATEGORY_TIPS[topCat.toLowerCase()] ||
        'Small trims here add up fast — scan the individual charges for easy wins.';
      insights.push({
        id: 'top-category',
        type: 'info',
        title: `${topCat} is your biggest expense (${share}%)`,
        detail: `${fmt(topAmt)} of ${fmt(total90)} in the last 90 days. ${tip}`,
        impact: 40,
      });
    }
  }

  // 5. Big ticket — largest single expense in the last 30 days, if sizeable.
  const exp30 = last30.filter((t) => t.type === 'expense');
  if (exp30.length > 0) {
    const biggest = exp30.reduce((a, b) => (amount(b) > amount(a) ? b : a));
    if (amount(biggest) > 500) {
      const desc = (biggest.description || 'An expense').trim() || 'An expense';
      insights.push({
        id: 'big-ticket',
        type: 'warning',
        title: `Big purchase: ${desc} (${fmt(amount(biggest))})`,
        detail: `Your largest single expense in the last 30 days. Big one-offs are worth a second look — could it have waited, or been shopped around?`,
        impact: 60,
      });
    }
  }

  // 6. Savings rate over the last 90 days.
  const inc90 = last90
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + amount(t), 0);
  const exp90Total = exp90.reduce((s, t) => s + amount(t), 0);
  if (inc90 > 0) {
    const rate = (inc90 - exp90Total) / inc90;
    if (rate > 0.2) {
      insights.push({
        id: 'savings-rate-good',
        type: 'success',
        title: `Strong savings rate: ${Math.round(rate * 100)}%`,
        detail: `You're keeping ${fmt(inc90 - exp90Total)} of ${fmt(inc90)} earned in the last 90 days. Anything above 20% is excellent — keep it up.`,
        impact: 30,
      });
    } else if (rate < 0) {
      insights.push({
        id: 'savings-rate-negative',
        type: 'danger',
        title: 'Spending more than you earn',
        detail: `Outgoings beat income by ${fmt(exp90Total - inc90)} over the last 90 days. The insights above show the fastest places to claw it back.`,
        impact: 65,
      });
    } else {
      insights.push({
        id: 'savings-rate-low',
        type: 'info',
        title: `Savings rate is ${Math.round(rate * 100)}%`,
        detail: `You're saving ${fmt(inc90 - exp90Total)} of ${fmt(inc90)}. Trimming your top categories is the quickest way to push it higher.`,
        impact: 20,
      });
    }
  }

  insights.sort((a, b) => b.impact - a.impact);
  return insights.slice(0, 6);
}
