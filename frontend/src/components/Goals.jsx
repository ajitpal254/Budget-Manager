import React from 'react';

export default function Goals({ goals, formatCurrency, formatDate, onAddTrigger, onEdit, onDelete }) {
  return (
    <div className="tab-view active">
      <div className="budget-header-row">
        <h2 className="tab-section-title">Track Saving Goals</h2>
        <button className="btn btn-secondary" onClick={onAddTrigger}>
          Create Savings Goal
        </button>
      </div>

      <div className="goals-grid">
        {goals.map((g, idx) => {
          // Progress math
          const percent = Math.min(100, g.target > 0 ? (g.current / g.target) * 100 : 0);
          const radius = 32;
          const strokeWidth = 6;
          const circumference = 2 * Math.PI * radius;
          const dashOffset = circumference - (percent / 100) * circumference;

          return (
            <div className="card glass-card goal-card" key={g._id || idx}>
              <div className="goal-ring-wrapper">
                <svg className="goal-ring-svg" viewBox="0 0 80 80">
                  <defs>
                    <linearGradient id={`goal-grad-${g._id || idx}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                  
                  {/* Background Circle */}
                  <circle
                    className="goal-ring-bg"
                    cx="40"
                    cy="40"
                    r={radius}
                    fill="transparent"
                    strokeWidth={strokeWidth}
                  />

                  {/* Foreground Animated Circle */}
                  <circle
                    className="goal-ring-fill"
                    cx="40"
                    cy="40"
                    r={radius}
                    fill="transparent"
                    stroke={`url(#goal-grad-${g._id || idx})`}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                  />
                </svg>
                <div className="goal-ring-text">{Math.round(percent)}%</div>
              </div>

              <div className="goal-details">
                <span className="goal-name">{g.name}</span>
                <span className="goal-progress-desc">
                  {formatCurrency(g.current)} of {formatCurrency(g.target)}
                </span>
                {g.deadline && (
                  <span className="goal-deadline-label">
                    Target Date: {formatDate(g.deadline)}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <button className="btn btn-text" onClick={() => onEdit(g)}>
                  Edit
                </button>
                <button className="btn btn-text text-danger" onClick={() => onDelete(g._id)}>
                  Remove
                </button>
              </div>
            </div>
          );
        })}

        {goals.length === 0 && (
          <div className="card glass-card" style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-muted)' }}>
            No savings goals created yet. Set a goal above!
          </div>
        )}
      </div>
    </div>
  );
}
