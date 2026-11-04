import React, { useEffect, useState } from 'react';
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
import { apiFetch } from '../api';

// Cash-flow forecast: projected income/expenses/net for the next 3 months,
// computed server-side from the user's recurring transactions.
export default function ForecastCard({ formatCurrency }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/forecast?months=3')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  if (!data || data.length === 0) return null;
  const allZero = data.every((m) => m.income === 0 && m.expenses === 0);
  if (allZero) return null;

  return (
    <div className="card glass-card">
      <h3 className="card-title">🔮 Cash Flow Forecast</h3>
      <p className="card-subtitle">Projected from your recurring transactions</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
          />
          <Tooltip
            formatter={(value) => formatCurrency(value)}
            contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}
          />
          <Legend />
          <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="forecast-net-row">
        {data.map((m) => (
          <div key={m.key} className="forecast-net-item">
            <span className="forecast-net-label">{m.label}</span>
            <span className={m.net >= 0 ? 'text-success' : 'text-danger'}>
              {m.net >= 0 ? '+' : ''}{formatCurrency(m.net)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
