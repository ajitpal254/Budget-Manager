import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

// Income vs. expenses per month for the last 6 months (including the
// current month). Renders nothing when there is no data to plot.
export default function TrendsChart({ transactions, formatCurrency }) {
  const data = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        income: 0,
        expense: 0
      });
    }
    const byKey = Object.fromEntries(months.map(m => [m.key, m]));
    transactions.forEach(t => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = byKey[key];
      if (bucket && (t.type === 'income' || t.type === 'expense')) {
        bucket[t.type] += t.amount;
      }
    });
    return months;
  }, [transactions]);

  const hasData = data.some(m => m.income > 0 || m.expense > 0);
  if (!hasData) return null;

  return (
    <div className="card glass-card trends-card">
      <h2 className="section-heading">Income vs Expenses — Last 6 Months</h2>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`)}
            />
            <Tooltip
              formatter={value => formatCurrency(value)}
              contentStyle={{
                background: 'rgba(20,24,40,0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#f8fafc'
              }}
            />
            <Legend wrapperStyle={{ color: '#94a3b8' }} />
            <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
