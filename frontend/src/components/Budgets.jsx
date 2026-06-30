import React from 'react';

export default function Budgets({ budgets, transactions, formatCurrency, onAddTrigger, onDelete }) {
  // Calculate total spent in each category from transaction lists
  const categorySpends = {};
  transactions.forEach(t => {
    if (t.type === 'expense') {
      const cat = t.category.trim();
      categorySpends[cat] = (categorySpends[cat] || 0) + t.amount;
    }
  });

  return (
    <div className="tab-view active">
      <div className="budget-header-row">
        <h2 className="tab-section-title">Configure Category Limits</h2>
        <button className="btn btn-secondary" onClick={onAddTrigger}>
          Set Category Budget
        </button>
      </div>

      <div className="budgets-grid">
        {budgets.map((b, idx) => {
          const spent = categorySpends[b.category] || 0;
          const percent = Math.min(100, b.limit > 0 ? (spent / b.limit) * 100 : 0);
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
