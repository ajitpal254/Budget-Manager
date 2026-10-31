import React from 'react';
import { computeBudgetStatus } from '../budgetAlerts.js';

export default function Budgets({ budgets, transactions, formatCurrency, onAddTrigger, onDelete, warningPct, dangerPct }) {
  // Per-category spend vs. limit, with warning/danger status from the
  // user's thresholds (80/100 defaults when unset)
  const statuses = computeBudgetStatus(budgets, transactions, warningPct, dangerPct);
  const statusByCategory = {};
  statuses.forEach(s => { statusByCategory[s.budget.category] = s; });

  return (
    <div className="tab-view active">
      <div className="budget-header-row">
        <h2 className="tab-section-title">Configure Category Limits</h2>
        <button className="btn btn-secondary" onClick={onAddTrigger}>
          Set Category Budget
        </button>
      </div>

      <div className="budgets-grid">
        {statuses.map((s, idx) => {
          const b = s.budget;
          const spent = s.spent;
          const percent = Math.min(100, s.percent);
          const remaining = b.limit - spent;

          // Compute color thresholds
          let fillClass = 'fill-safe';
          if (percent >= 100) {
            fillClass = 'fill-danger';
          } else if (percent >= 70) {
            fillClass = 'fill-warning';
          }

          return (
            <div className="card glass-card budget-card" key={b._id || idx}>
              <div className="budget-meta">
                <span className="budget-cat">{b.category}</span>
                <span className="budget-limit-label">Limit: {formatCurrency(b.limit)}</span>
              </div>

              {s.status !== 'ok' && (
                <span className={`alert-badge ${s.status === 'danger' ? 'alert-danger' : 'alert-warning'}`}>
                  {s.status === 'danger'
                    ? `Over budget by ${formatCurrency(spent - b.limit)}`
                    : `${Math.round(s.percent)}% of budget used`}
                </span>
              )}

              <div className="budget-progress-container">
                <div className="progress-track">
                  <div
                    className={`progress-fill ${fillClass}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                
                <div className="budget-spend-info">
                  <span>Spent: {formatCurrency(spent)}</span>
                  <span className={remaining < 0 ? 'text-danger' : ''}>
                    {remaining >= 0
                      ? `Remaining: ${formatCurrency(remaining)}`
                      : `Over limit by: ${formatCurrency(Math.abs(remaining))}`}
                  </span>
                </div>
              </div>

              <div className="budget-card-footer">
                <button className="btn btn-text text-danger" onClick={() => onDelete(b._id)}>
                  Remove
                </button>
              </div>
            </div>
          );
        })}

        {budgets.length === 0 && (
          <div className="card glass-card" style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-muted)' }}>
            No budget limits configured. Click the button above to set one.
          </div>
        )}
      </div>
    </div>
  );
}
