import React, { useMemo } from 'react';

// Category trends: this month vs last month, per expense category.
// Pure client-side computation from the loaded transactions. Shows the
// biggest movers (up or down) so the user spots spending shifts at a glance.
export default function CategoryTrends({ transactions, formatCurrency }) {
  const rows = useMemo(() => {
    const now = new Date();
    const thisKey = `${now.getFullYear()}-${now.getMonth()}`;
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastKey = `${last.getFullYear()}-${last.getMonth()}`;

    const sumByCat = (key) => {
      const out = {};
      transactions.forEach((t) => {
        if (t.type !== 'expense') return;
        const d = new Date(t.date);
        if (`${d.getFullYear()}-${d.getMonth()}` !== key) return;
        out[t.category] = (out[t.category] || 0) + t.amount;
      });
      return out;
    };

    const thisMonth = sumByCat(thisKey);
    const lastMonth = sumByCat(lastKey);
    const cats = new Set([...Object.keys(thisMonth), ...Object.keys(lastMonth)]);

    return [...cats]
      .map((cat) => {
        const cur = thisMonth[cat] || 0;
        const prev = lastMonth[cat] || 0;
        const change = cur - prev;
        const pct = prev > 0 ? Math.round((change / prev) * 100) : cur > 0 ? 100 : 0;
        return { cat, cur, prev, change, pct };
      })
      .filter((r) => r.cur > 0 || r.prev > 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 6);
  }, [transactions]);

  if (rows.length === 0) return null;

  return (
    <div className="card glass-card">
      <h3 className="card-title">📊 Category Trends</h3>
      <p className="card-subtitle">This month vs last month</p>
      <ul className="trend-list">
        {rows.map((r) => (
          <li key={r.cat} className="trend-item">
            <div className="trend-cat">
              <span className="trend-name">{r.cat}</span>
              <span className="trend-amounts">
                {formatCurrency(r.prev)} → {formatCurrency(r.cur)}
              </span>
            </div>
            <span
              className={`trend-delta ${r.change > 0 ? 'text-danger' : r.change < 0 ? 'text-success' : 'text-muted'}`}
            >
              {r.change > 0 ? '▲' : r.change < 0 ? '▼' : '•'}{' '}
              {r.change === 0 ? 'no change' : `${r.change > 0 ? '+' : ''}${r.pct}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
