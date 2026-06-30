import React from 'react';

const categoryColors = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#06b6d4', '#14b8a6', '#f43f5e', '#a855f7'
];

export default function Dashboard({ transactions, formatCurrency, formatDate, setTab }) {
  // Stats
  const income = transactions
    .filter(t => t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0);

  const expenses = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => acc + t.amount, 0);

  const net = income - expenses;

  // Chart math
  const expenseTransactions = transactions.filter(t => t.type === 'expense');
  
  // Aggregate category spends
  const categorySpends = {};
  expenseTransactions.forEach(t => {
    categorySpends[t.category] = (categorySpends[t.category] || 0) + t.amount;
  });

  const sortedCategories = Object.keys(categorySpends)
    .map((cat, idx) => ({
      category: cat,
      amount: categorySpends[cat],
      percent: expenses > 0 ? (categorySpends[cat] / expenses) * 100 : 0,
      color: categoryColors[idx % categoryColors.length]
    }))
    .sort((a, b) => b.amount - a.amount);

  // SVG Donut Config
  const radius = 65;
  const strokeWidth = 24;
  const cx = 100;
  const cy = 100;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPercent = 0;

  return (
    <div className="tab-view active">
      {/* Overview stats cards grid */}
      <div className="overview-grid">
        <div className="card glass-card">
          <div className="card-header">
            <span className="card-title">Net Balance</span>
            <div className="card-icon balance-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
          </div>
          <p className="card-value">{formatCurrency(net)}</p>
          <p className="card-desc">All-time net standing</p>
        </div>

        <div className="card glass-card">
          <div className="card-header">
            <span className="card-title">Total Income</span>
            <div className="card-icon income-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </div>
          </div>
          <p className="card-value text-success">{formatCurrency(income)}</p>
          <p className="card-desc">Total cash flows inward</p>
        </div>

        <div className="card glass-card">
          <div className="card-header">
            <span className="card-title">Total Expenses</span>
            <div className="card-icon expense-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </div>
          </div>
          <p className="card-value text-danger">{formatCurrency(expenses)}</p>
          <p className="card-desc">Total outgoing payments</p>
        </div>
      </div>

      {/* Main Charts / List Grid */}
      <div className="dashboard-grid">
        <div className="card glass-card">
          <h2 className="section-heading">Expense Distribution by Category</h2>
          <div className="chart-container">
            {expenses === 0 ? (
              <div className="chart-placeholder">No expense transactions recorded.</div>
            ) : (
              <div className="chart-layout-wrapper">
                <svg viewBox="0 0 200 200" style={{ width: '100%', maxHeight: '240px' }}>
                  {sortedCategories.map((item, index) => {
                    const strokeDashoffset = circumference - (item.percent / 100) * circumference;
                    const rotation = (accumulatedPercent / 100) * 360 - 90;
                    accumulatedPercent += item.percent;

                    return (
                      <circle
                        key={index}
                        cx={cx}
                        cy={cy}
                        r={radius}
                        fill="transparent"
                        stroke={item.color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        transform={`rotate(${rotation} ${cx} ${cy})`}
                      />
                    );
                  })}
                </svg>

                <div className="pie-chart-legend">
                  {sortedCategories.map((item, idx) => (
                    <div className="legend-item" key={idx}>
                      <span className="legend-color" style={{ backgroundColor: item.color }} />
                      <span className="legend-label">{item.category}</span>
                      <span className="legend-value">
                        {formatCurrency(item.amount)} ({item.percent.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Transactions List Card */}
        <div className="card glass-card">
          <div className="card-section-header">
            <h2 className="section-heading">Recent Transactions</h2>
            <button className="btn btn-text" onClick={() => setTab('transactions')}>
              View All
            </button>
          </div>
          <div className="recent-list-container">
            <ul className="transaction-list">
              {transactions.slice(0, 5).map((t, idx) => (
                <li className="tx-item" key={t._id || idx}>
                  <div className="tx-item-left">
                    <span className="tx-category-badge">{t.category}</span>
                    <div className="tx-details">
                      <span className="tx-desc">{t.description}</span>
                      <span className="tx-date">{formatDate(t.date)}</span>
                    </div>
                  </div>
                  <span className={`tx-amount ${t.type === 'income' ? 'text-success' : 'text-danger'}`}>
                    {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                  </span>
                </li>
              ))}
              {transactions.length === 0 && (
                <li className="tx-item" style={{ justifyContent: 'center' }}>
                  No transactions recorded yet.
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
