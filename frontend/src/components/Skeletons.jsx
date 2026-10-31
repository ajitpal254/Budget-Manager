import React from 'react';

// Shimmer placeholder block. Width/height come from inline styles so each
// skeleton can mimic the layout it replaces.
function Block({ style }) {
  return <div className="skeleton-block" style={style} aria-hidden="true" />;
}

function StatCardSkeleton() {
  return (
    <div className="card glass-card">
      <Block style={{ height: '14px', width: '42%', marginBottom: '12px' }} />
      <Block style={{ height: '32px', width: '62%', marginBottom: '8px' }} />
      <Block style={{ height: '12px', width: '52%' }} />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="tab-view active" aria-label="Loading dashboard">
      <div className="overview-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="dashboard-grid">
        <div className="card glass-card">
          <Block style={{ height: '20px', width: '48%', marginBottom: '18px' }} />
          <Block style={{ height: '210px', width: '100%' }} />
        </div>
        <div className="card glass-card">
          <Block style={{ height: '20px', width: '42%', marginBottom: '18px' }} />
          {[0, 1, 2, 3].map(i => (
            <Block key={i} style={{ height: '54px', width: '100%', marginBottom: '10px' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TransactionsSkeleton() {
  return (
    <div className="tab-view active" aria-label="Loading transactions">
      <div className="card glass-card filter-card">
        <Block style={{ height: '40px', width: '100%' }} />
      </div>
      <div className="card glass-card table-card">
        <Block style={{ height: '20px', width: '30%', marginBottom: '14px' }} />
        {[0, 1, 2, 3, 4, 5].map(i => (
          <Block key={i} style={{ height: '44px', width: '100%', marginBottom: '8px' }} />
        ))}
      </div>
    </div>
  );
}

// Generic card-grid placeholder used for the budgets and goals tabs.
export function GridSkeleton({ count = 4 }) {
  return (
    <div className="tab-view active" aria-label="Loading">
      <div className="budgets-grid">
        {Array.from({ length: count }).map((_, i) => (
          <div className="card glass-card" key={i}>
            <Block style={{ height: '20px', width: '55%', marginBottom: '14px' }} />
            <Block style={{ height: '12px', width: '100%', marginBottom: '10px' }} />
            <Block style={{ height: '12px', width: '75%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
