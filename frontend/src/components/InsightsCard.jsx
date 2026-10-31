import React, { useState } from 'react';

const ICONS = {
  danger: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  warning: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
};

export default function InsightsCard({ insights }) {
  const [showAll, setShowAll] = useState(false);
  if (!Array.isArray(insights) || insights.length === 0) return null;

  const isEmpty = insights.length === 1 && insights[0].id === 'getting-started';
  const visible = showAll ? insights : insights.slice(0, 3);

  return (
    <div className="card glass-card insights-card">
      <h2 className="section-heading">Smart Insights</h2>
      <ul className="insights-list">
        {visible.map((i) => (
          <li key={i.id} className={`insight-row insight-${i.type}`}>
            <span className="insight-icon" aria-hidden="true">
              {ICONS[i.type] || ICONS.info}
            </span>
            <div className="insight-body">
              <strong className="insight-title">{i.title}</strong>
              <p className="insight-detail">{i.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {!isEmpty && insights.length > 3 && (
        <button className="btn btn-text" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show less' : `Show all ${insights.length} insights`}
        </button>
      )}
    </div>
  );
}
