import React, { useState, useEffect, useRef } from 'react';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import Budgets from './components/Budgets';
import Goals from './components/Goals';
import Auth from './components/Auth';
import ErrorBoundary from './components/ErrorBoundary';
import { DashboardSkeleton, TransactionsSkeleton, GridSkeleton } from './components/Skeletons';
import { computeBudgetStatus } from './budgetAlerts.js';
import { apiFetch, getCookie } from './api.js';

export default function App() {
  // State variables
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // True only while the first data fetch after sign-in runs; drives skeletons.
  const [initialLoading, setInitialLoading] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [dbStatus, setDbStatus] = useState('connecting');

  // Modals state
  const [txModal, setTxModal] = useState({ open: false, mode: 'add', data: null });
  const [budgetModal, setBudgetModal] = useState({ open: false, data: null });
  const [goalModal, setGoalModal] = useState({ open: false, mode: 'add', data: null });

  // Toast notifications: [{ id, type: 'success' | 'error', message }]
  const [toasts, setToasts] = useState([]);
  const pushToast = (type, message) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };
  const dismissToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  // Tracks per-budget alert status across data loads so toasts fire only
  // when a threshold is newly crossed, not on every refresh.
  const prevBudgetStatuses = useRef({});
  const alertsInitialized = useRef(false);

  const checkBudgetAlerts = (nextBudgets, nextTransactions) => {
    const statuses = computeBudgetStatus(nextBudgets, nextTransactions);
    if (!alertsInitialized.current) {
      // First load: record the current state silently instead of toasting for it.
      alertsInitialized.current = true;
    } else {
      statuses.forEach(s => {
        const key = s.budget._id || s.budget.category;
        const prev = prevBudgetStatuses.current[key];
        if (prev !== s.status && s.status !== 'ok') {
          pushToast(
            s.status === 'danger' ? 'error' : 'warning',
            s.status === 'danger'
              ? `Budget alert: "${s.budget.category}" is over its limit.`
              : `Budget alert: "${s.budget.category}" has used ${Math.round(s.percent)}% of its limit.`
          );
        }
      });
    }
    const next = {};
    statuses.forEach(s => { next[s.budget._id || s.budget.category] = s.status; });
    prevBudgetStatuses.current = next;
  };

  // Generic confirmation dialog (used for deletes)
  const [confirmDialog, setConfirmDialog] = useState({
    open: false, title: '', message: '', confirmLabel: 'Delete', onConfirm: null
  });
  const askConfirm = ({ title, message, confirmLabel = 'Delete', onConfirm }) =>
    setConfirmDialog({ open: true, title, message, confirmLabel, onConfirm });
  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false, onConfirm: null }));

  // Per-form submit state (prevents double-submits, drives button labels)
  const [saving, setSaving] = useState({ tx: false, budget: false, goal: false });

  // Initial load
  useEffect(() => {
    checkAuth();
  }, []);

  // Close any open modal/dialog with the Escape key
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setTxModal({ open: false, mode: 'add', data: null });
        setBudgetModal({ open: false, data: null });
        setGoalModal({ open: false, mode: 'add', data: null });
        setConfirmDialog(d => ({ ...d, open: false, onConfirm: null }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const checkAuth = async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setDbStatus('connected');
        // Fetch data
        await loadInitialData();
      } else {
        setUser(null);
        setDbStatus('connected');
        // Fetch initial CSRF token for guest actions (Login/Register)
        await apiFetch('/api/auth/csrf-token');
      }
    } catch (err) {
      console.error('Error checking authentication status:', err);
      setDbStatus('error');
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchInitialData = async () => {
    try {
      const [txRes, budgetRes, goalRes] = await Promise.all([
        apiFetch('/api/transactions'),
        apiFetch('/api/budgets'),
        apiFetch('/api/goals')
      ]);

      let txs = [];
      let bds = [];
      if (txRes.ok) {
        txs = await txRes.json();
        setTransactions(txs);
      }

      if (budgetRes.ok) {
        bds = await budgetRes.json();
        setBudgets(bds);
      }
      if (goalRes.ok) setGoals(await goalRes.json());

      checkBudgetAlerts(bds, txs);
    } catch (err) {
      console.error('Error fetching backend data:', err);
    }
  };

  // First data fetch after sign-in: shows skeleton placeholders instead of
  // a blank wait. Later refetches (after CRUD) update silently.
  const loadInitialData = async () => {
    setInitialLoading(true);
    try {
      await fetchInitialData();
    } finally {
      setInitialLoading(false);
    }
  };

  // --- AUTH HANDLERS ---
  const handleAuthSuccess = (userData) => {
    setUser(userData);
    loadInitialData();
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'x-csrf-token': getCookie('csrfToken')
        }
      });
    } catch (err) {
      console.error('Logout request failed:', err);
    }
    // Reset all app state instead of reloading the page, so the PWA shell
    // stays alive and there is no flash. The Auth view renders once user
    // is null.
    setUser(null);
    setTab('dashboard');
    setTransactions([]);
    setBudgets([]);
    setGoals([]);
    setTxModal({ open: false, mode: 'add', data: null });
    setBudgetModal({ open: false, data: null });
    setGoalModal({ open: false, mode: 'add', data: null });
    setConfirmDialog({ open: false, title: '', message: '', confirmLabel: 'Delete', onConfirm: null });
    setToasts([]);
    setDbStatus('connecting');
    prevBudgetStatuses.current = {};
    alertsInitialized.current = false;
    // The logout cleared the CSRF cookie; fetch a fresh guest token so the
    // login/register form can submit again without a page reload.
    try {
      await apiFetch('/api/auth/csrf-token');
    } catch (err) {
      console.error('CSRF token refresh failed:', err);
    }
  };

  // --- HELPER FORMATTERS ---
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  };

  // --- TRANSACTION CRUD ---
  const handleTxSubmit = async (e) => {
    e.preventDefault();
    if (saving.tx) return;
    setSaving(s => ({ ...s, tx: true }));
    const formData = new FormData(e.target);
    const id = formData.get('id');
    const payload = {
      description: formData.get('description').trim(),
      amount: parseFloat(formData.get('amount')),
      type: formData.get('type'),
      category: formData.get('category').trim(),
      date: new Date(formData.get('date')).toISOString()
    };

    try {
      let res;
      const headers = {
        'Content-Type': 'application/json',
        'x-csrf-token': getCookie('csrfToken')
      };

      if (id) {
        res = await apiFetch(`/api/transactions/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload)
        });
      } else {
        res = await apiFetch('/api/transactions', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        setTxModal({ open: false, mode: 'add', data: null });
        await fetchInitialData();
        pushToast('success', id ? 'Transaction updated.' : 'Transaction added.');
      } else {
        const data = await res.json().catch(() => ({}));
        pushToast('error', data.error || 'Could not save transaction.');
      }
    } catch (err) {
      console.error('Error saving transaction:', err);
      pushToast('error', 'Could not save transaction. Check your connection.');
    } finally {
      setSaving(s => ({ ...s, tx: false }));
    }
  };

  const handleTxDelete = (id) => {
    const t = transactions.find(tx => tx._id === id);
    askConfirm({
      title: 'Delete transaction?',
      message: `This will permanently delete "${t?.description || 'this transaction'}"${t ? ` (${formatCurrency(t.amount)})` : ''}. This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/transactions/${id}`, {
            method: 'DELETE',
            headers: {
              'x-csrf-token': getCookie('csrfToken')
            }
          });
          if (res.ok) {
            await fetchInitialData();
            pushToast('success', 'Transaction deleted.');
          } else {
            const data = await res.json().catch(() => ({}));
            pushToast('error', data.error || 'Could not delete transaction.');
          }
        } catch (err) {
          console.error('Error deleting transaction:', err);
          pushToast('error', 'Could not delete transaction. Check your connection.');
        }
      }
    });
  };

  const handleTxEditTrigger = (t) => {
    setTxModal({ open: true, mode: 'edit', data: t });
  };

  // --- BUDGETS CRUD ---
  const handleBudgetSubmit = async (e) => {
    e.preventDefault();
    if (saving.budget) return;
    setSaving(s => ({ ...s, budget: true }));
    const formData = new FormData(e.target);
    const payload = {
      category: formData.get('category').trim(),
      limit: parseFloat(formData.get('limit'))
    };

    try {
      const res = await apiFetch('/api/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCookie('csrfToken')
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setBudgetModal({ open: false, data: null });
        await fetchInitialData();
        pushToast('success', `Budget for "${payload.category}" saved.`);
      } else {
        const data = await res.json().catch(() => ({}));
        pushToast('error', data.error || 'Could not save budget.');
      }
    } catch (err) {
      console.error('Error saving budget:', err);
      pushToast('error', 'Could not save budget. Check your connection.');
    } finally {
      setSaving(s => ({ ...s, budget: false }));
    }
  };

  const handleBudgetDelete = (id) => {
    const b = budgets.find(budget => budget._id === id);
    askConfirm({
      title: 'Remove budget?',
      message: `This will remove the budget limit for "${b?.category || 'this category'}". Your transactions will not be affected.`,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/budgets/${id}`, {
            method: 'DELETE',
            headers: {
              'x-csrf-token': getCookie('csrfToken')
            }
          });
          if (res.ok) {
            await fetchInitialData();
            pushToast('success', 'Budget removed.');
          } else {
            const data = await res.json().catch(() => ({}));
            pushToast('error', data.error || 'Could not remove budget.');
          }
        } catch (err) {
          console.error('Error deleting budget:', err);
          pushToast('error', 'Could not remove budget. Check your connection.');
        }
      }
    });
  };

  // --- GOALS CRUD ---
  const handleGoalSubmit = async (e) => {
    e.preventDefault();
    if (saving.goal) return;
    setSaving(s => ({ ...s, goal: true }));
    const formData = new FormData(e.target);
    const id = formData.get('id');
    const deadlineVal = formData.get('deadline');
    const payload = {
      name: formData.get('name').trim(),
      target: parseFloat(formData.get('target')),
      current: parseFloat(formData.get('current') || 0),
      deadline: deadlineVal ? new Date(deadlineVal).toISOString() : undefined
    };

    try {
      let res;
      const headers = {
        'Content-Type': 'application/json',
        'x-csrf-token': getCookie('csrfToken')
      };

      if (id) {
        res = await apiFetch(`/api/goals/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload)
        });
      } else {
        res = await apiFetch('/api/goals', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        setGoalModal({ open: false, mode: 'add', data: null });
        await fetchInitialData();
        pushToast('success', id ? 'Goal updated.' : 'Goal created.');
      } else {
        const data = await res.json().catch(() => ({}));
        pushToast('error', data.error || 'Could not save goal.');
      }
    } catch (err) {
      console.error('Error saving goal:', err);
      pushToast('error', 'Could not save goal. Check your connection.');
    } finally {
      setSaving(s => ({ ...s, goal: false }));
    }
  };

  const handleGoalDelete = (id) => {
    const g = goals.find(goal => goal._id === id);
    askConfirm({
      title: 'Remove goal?',
      message: `This will permanently remove the "${g?.name || 'this'}" savings goal. This cannot be undone.`,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/goals/${id}`, {
            method: 'DELETE',
            headers: {
              'x-csrf-token': getCookie('csrfToken')
            }
          });
          if (res.ok) {
            await fetchInitialData();
            pushToast('success', 'Goal removed.');
          } else {
            const data = await res.json().catch(() => ({}));
            pushToast('error', data.error || 'Could not remove goal.');
          }
        } catch (err) {
          console.error('Error deleting goal:', err);
          pushToast('error', 'Could not remove goal. Check your connection.');
        }
      }
    });
  };

  const handleGoalEditTrigger = (g) => {
    setGoalModal({ open: true, mode: 'edit', data: g });
  };

  // Page title dynamic logic
  const getPageTitle = () => {
    switch (tab) {
      case 'dashboard': return 'Dashboard';
      case 'transactions': return 'Transactions Ledger';
      case 'budgets': return 'Category Budgets';
      case 'goals': return 'Saving Goals';
      default: return 'Aura';
    }
  };

  if (authLoading) {
    return (
      <div className="auth-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500 }}>Initializing session...</p>
      </div>
    );
  }

  if (!user) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="app-container">
      {/* Desktop Sidebar Layout */}
      <aside className="sidebar" aria-label="Main Navigation">
        <div className="brand">
          <svg className="brand-logo" width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="14" stroke="url(#logo-grad-app)" strokeWidth="3" />
            <path d="M16 8V24M11 12H18.5C19.8807 12 21 13.1193 21 14.5C21 15.8807 19.8807 17 18.5 17H13.5C12.1193 17 11 18.1193 11 19.5C11 20.8807 12.1193 22 13.5 22H21" stroke="url(#logo-grad-app)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <defs>
              <linearGradient id="logo-grad-app" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                <stop stopColor="#8B5CF6"/>
                <stop offset="1" stopColor="#EC4899"/>
              </linearGradient>
            </defs>
          </svg>
          <span className="brand-name">Aura</span>
        </div>

        <nav className="nav-menu">
          <button className={`nav-item ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
            <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
            Dashboard
          </button>
          <button className={`nav-item ${tab === 'transactions' ? 'active' : ''}`} onClick={() => setTab('transactions')}>
            <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Transactions
          </button>
          <button className={`nav-item ${tab === 'budgets' ? 'active' : ''}`} onClick={() => setTab('budgets')}>
            <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            Budgets
          </button>
          <button className={`nav-item ${tab === 'goals' ? 'active' : ''}`} onClick={() => setTab('goals')}>
            <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            Saving Goals
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile-section" style={{ marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="user-profile-name" style={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</p>
            <p className="user-profile-email" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.5rem' }}>{user.email}</p>
            <button className="btn btn-secondary btn-text text-danger" style={{ padding: 0, fontSize: '0.85rem' }} onClick={handleLogout}>
              Sign Out
            </button>
          </div>
          <p className={`db-status ${dbStatus === 'connected' ? 'connected' : dbStatus === 'error' ? 'error' : ''}`}>
            {dbStatus === 'connected' ? 'DB Connected' : dbStatus === 'error' ? 'DB Offline' : 'Connecting to DB...'}
          </p>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="main-content">
        <header className="top-bar">
          <h1>{getPageTitle()}</h1>
          <div className="action-group" style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={() => setTxModal({ open: true, mode: 'add', data: null })} title="Add Transaction">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span className="btn-text-desktop">Add Transaction</span>
            </button>
            <button className="btn btn-secondary mobile-logout-btn" onClick={handleLogout} title="Sign Out">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span className="btn-text-desktop">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Tab content switching.
            Skeletons show during the first data fetch; each tab is wrapped
            in its own error boundary so one crashing widget can't blank
            the whole app. */}
        {initialLoading ? (
          tab === 'dashboard' ? <DashboardSkeleton /> :
          tab === 'transactions' ? <TransactionsSkeleton /> :
          <GridSkeleton />
        ) : (
          <>
            {tab === 'dashboard' && (
              <ErrorBoundary key="dashboard">
                <Dashboard
                  transactions={transactions}
                  budgets={budgets}
                  formatCurrency={formatCurrency}
                  formatDate={formatDate}
                  setTab={setTab}
                />
              </ErrorBoundary>
            )}
            {tab === 'transactions' && (
              <ErrorBoundary key="transactions">
                <Transactions
                  transactions={transactions}
                  formatCurrency={formatCurrency}
                  formatDate={formatDate}
                  onEdit={handleTxEditTrigger}
                  onDelete={handleTxDelete}
                />
              </ErrorBoundary>
            )}
            {tab === 'budgets' && (
              <ErrorBoundary key="budgets">
                <Budgets
                  budgets={budgets}
                  transactions={transactions}
                  formatCurrency={formatCurrency}
                  onAddTrigger={() => setBudgetModal({ open: true, data: null })}
                  onDelete={handleBudgetDelete}
                />
              </ErrorBoundary>
            )}
            {tab === 'goals' && (
              <ErrorBoundary key="goals">
                <Goals
                  goals={goals}
                  formatCurrency={formatCurrency}
                  formatDate={formatDate}
                  onAddTrigger={() => setGoalModal({ open: true, mode: 'add', data: null })}
                  onEdit={handleGoalEditTrigger}
                  onDelete={handleGoalDelete}
                />
              </ErrorBoundary>
            )}
          </>
        )}
      </main>

      {/* Mobile Navigation bar */}
      <nav className="mobile-nav" aria-label="Mobile Navigation">
        <button className={`mobile-nav-item ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
          <span>Dashboard</span>
        </button>
        <button className={`mobile-nav-item ${tab === 'transactions' ? 'active' : ''}`} onClick={() => setTab('transactions')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          <span>Ledger</span>
        </button>
        <button className={`mobile-nav-item ${tab === 'budgets' ? 'active' : ''}`} onClick={() => setTab('budgets')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          <span>Budgets</span>
        </button>
        <button className={`mobile-nav-item ${tab === 'goals' ? 'active' : ''}`} onClick={() => setTab('goals')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
          <span>Goals</span>
        </button>
      </nav>

      {/* --- MODALS OVERLAYS --- */}

      {/* Transaction Modal */}
      <div className={`modal ${txModal.open ? 'show' : ''}`} role="dialog" aria-hidden={!txModal.open}>
        <div className="modal-content glass-card">
          <div className="modal-header">
            <h3>{txModal.mode === 'edit' ? 'Edit Transaction' : 'Add Transaction'}</h3>
            <button className="btn-close" onClick={() => setTxModal({ open: false, mode: 'add', data: null })}>&times;</button>
          </div>
          <form onSubmit={handleTxSubmit}>
            <input type="hidden" name="id" defaultValue={txModal.data?._id || ''} />
            <div className="form-group">
              <label>Description</label>
              <input
                type="text"
                name="description"
                required
                maxLength={100}
                placeholder="e.g., Target grocery run"
                defaultValue={txModal.data?.description || ''}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Amount</label>
                <input
                  type="number"
                  name="amount"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  defaultValue={txModal.data?.amount || ''}
                />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select name="type" required defaultValue={txModal.data?.type || 'expense'}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Category</label>
                <input
                  type="text"
                  name="category"
                  required
                  placeholder="e.g., Food, Salary, Rent"
                  defaultValue={txModal.data?.category || ''}
                  list="app-categories-list"
                />
                <datalist id="app-categories-list">
                  <option value="Food" />
                  <option value="Rent" />
                  <option value="Salary" />
                  <option value="Utilities" />
                  <option value="Entertainment" />
                  <option value="Transportation" />
                  <option value="Shopping" />
                </datalist>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={
                    txModal.data?.date 
                      ? new Date(txModal.data.date).toISOString().split('T')[0] 
                      : new Date().toISOString().split('T')[0]
                  }
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setTxModal({ open: false, mode: 'add', data: null })}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving.tx}>
                {saving.tx ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Budget Modal */}
      <div className={`modal ${budgetModal.open ? 'show' : ''}`} role="dialog" aria-hidden={!budgetModal.open}>
        <div className="modal-content glass-card">
          <div className="modal-header">
            <h3>Set Budget Limit</h3>
            <button className="btn-close" onClick={() => setBudgetModal({ open: false, data: null })}>&times;</button>
          </div>
          <form onSubmit={handleBudgetSubmit}>
            <div className="form-group">
              <label>Category</label>
              <input
                type="text"
                name="category"
                required
                placeholder="e.g., Food, Shopping"
                defaultValue={budgetModal.data?.category || ''}
              />
            </div>
            <div className="form-group">
              <label>Monthly Limit Amount ($)</label>
              <input
                type="number"
                name="limit"
                step="0.01"
                min="0.01"
                required
                placeholder="500.00"
                defaultValue={budgetModal.data?.limit || ''}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setBudgetModal({ open: false, data: null })}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving.budget}>
                {saving.budget ? 'Saving…' : 'Save Budget'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Goal Modal */}
      <div className={`modal ${goalModal.open ? 'show' : ''}`} role="dialog" aria-hidden={!goalModal.open}>
        <div className="modal-content glass-card">
          <div className="modal-header">
            <h3>{goalModal.mode === 'edit' ? 'Edit Saving Goal' : 'Create Saving Goal'}</h3>
            <button className="btn-close" onClick={() => setGoalModal({ open: false, mode: 'add', data: null })}>&times;</button>
          </div>
          <form onSubmit={handleGoalSubmit}>
            <input type="hidden" name="id" defaultValue={goalModal.data?._id || ''} />
            <div className="form-group">
              <label>Goal Name</label>
              <input
                type="text"
                name="name"
                required
                placeholder="e.g., New Laptop, Car Fund"
                defaultValue={goalModal.data?.name || ''}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Target Amount ($)</label>
                <input
                  type="number"
                  name="target"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="2000.00"
                  defaultValue={goalModal.data?.target || ''}
                />
              </div>
              <div className="form-group">
                <label>Currently Saved ($)</label>
                <input
                  type="number"
                  name="current"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  defaultValue={goalModal.data?.current || '0'}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Target Deadline</label>
              <input
                type="date"
                name="deadline"
                defaultValue={
                  goalModal.data?.deadline
                    ? new Date(goalModal.data.deadline).toISOString().split('T')[0]
                    : ''
                }
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setGoalModal({ open: false, mode: 'add', data: null })}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving.goal}>
                {saving.goal ? 'Saving…' : 'Save Goal'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <div className={`modal ${confirmDialog.open ? 'show' : ''}`} role="dialog" aria-hidden={!confirmDialog.open}>
        <div className="modal-content glass-card" style={{ maxWidth: '420px' }}>
          <div className="modal-header">
            <h3>{confirmDialog.title}</h3>
            <button className="btn-close" onClick={closeConfirm}>&times;</button>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>
            {confirmDialog.message}
          </p>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={closeConfirm}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => { closeConfirm(); if (confirmDialog.onConfirm) confirmDialog.onConfirm(); }}
            >
              {confirmDialog.confirmLabel}
            </button>
          </div>
        </div>
      </div>

      {/* Toast notifications */}
      <div className="toast-container" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismissToast(t.id)}>
            <span className="toast-dot" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>

    </div>
  );
}
