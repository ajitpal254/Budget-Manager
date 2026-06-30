import React, { useState } from 'react';

const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return '';
};

export default function Auth({ onAuthSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const payload = isRegister ? { name, email, password } : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-csrf-token': getCookie('csrfToken')
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card glass-card">
        <div className="auth-brand">
          <svg className="brand-logo" width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="14" stroke="url(#logo-grad-auth)" strokeWidth="3" />
            <path d="M16 8V24M11 12H18.5C19.8807 12 21 13.1193 21 14.5C21 15.8807 19.8807 17 18.5 17H13.5C12.1193 17 11 18.1193 11 19.5C11 20.8807 12.1193 22 13.5 22H21" stroke="url(#logo-grad-auth)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <defs>
              <linearGradient id="logo-grad-auth" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                <stop stopColor="#8B5CF6"/>
                <stop offset="1" stopColor="#EC4899"/>
              </linearGradient>
            </defs>
          </svg>
          <span className="brand-name">Aura</span>
        </div>
        
        <h2 className="auth-title">
          {isRegister ? 'Create your account' : 'Welcome back'}
        </h2>
        <p className="auth-subtitle">
          {isRegister ? 'Start managing your finances securely' : 'Sign in to access your money manager'}
        </p>

        {error && <div className="auth-error-alert">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label htmlFor="auth-name">Full Name</label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ajit Pal"
                required
                maxLength={100}
              />
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="auth-email">Email Address</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-auth-submit" disabled={loading}>
            {loading ? 'Processing...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="auth-toggle-link">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button 
            type="button" 
            className="btn-text" 
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
          >
            {isRegister ? 'Sign In' : 'Create one now'}
          </button>
        </div>
      </div>
    </div>
  );
}
