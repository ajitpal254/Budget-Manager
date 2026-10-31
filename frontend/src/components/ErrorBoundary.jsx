import React from 'react';

// Catches render errors in the tab it wraps so one crashing widget
// doesn't blank the entire app. Each tab gets its own boundary.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Keep the noise in the console; the UI stays usable.
    console.error('ErrorBoundary caught a render error:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="card glass-card" role="alert" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <h3 className="tab-section-title" style={{ marginBottom: '0.5rem' }}>
            Something went wrong
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            This section ran into a problem. Your data is safe — try loading it again.
          </p>
          <button className="btn btn-secondary" onClick={this.handleRetry}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
