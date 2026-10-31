import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, getCookie } from '../api';

const FREQUENCY_LABELS = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  yearly: 'Yearly'
};

// Recurring transactions section, rendered inside the Transactions view.
// Templates are managed here (CRUD against /api/recurring); the backend
// materializes actual Transaction documents lazily on login / data load.
export default function Recurring({ formatCurrency, formatDate, askConfirm, pushToast, onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await apiFetch('/api/recurring');
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      setItems(await res.json());
    } catch (err) {
      console.error('Error fetching recurring transactions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const csrfHeaders = () => ({
    'Content-Type': 'application/json',
    'x-csrf-token': getCookie('csrfToken')
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const formData = new FormData(e.target);
    const payload = {
      description: formData.get('description').trim(),
      amount: parseFloat(formData.get('amount')),
      type: formData.get('type'),
      category: formData.get('category').trim(),
      frequency: formData.get('frequency'),
      nextRunDate: new Date(formData.get('nextRunDate')).toISOString()
    };
    try {
      const res = await apiFetch('/api/recurring', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowForm(false);
        e.target.reset();
        await fetchItems();
        // A past/today start date generates real transactions on the next
        // data load — refresh the ledger so they show up immediately.
        if (onChanged) await onChanged();
        pushToast('success', 'Recurring transaction added.');
      } else {
        const data = await res.json().catch(() => ({}));
        pushToast('error', data.error || 'Could not save recurring transaction.');
      }
    } catch (err) {
      console.error('Error saving recurring transaction:', err);
      pushToast('error', 'Could not save recurring transaction. Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item) => {
    try {
      const res = await apiFetch(`/api/recurring/${item._id}`, {
        method: 'PATCH',
        headers: csrfHeaders(),
        body: JSON.stringify({ active: !item.active })
      });
      if (res.ok) {
        await fetchItems();
        pushToast('success', item.active ? 'Recurring transaction paused.' : 'Recurring transaction resumed.');
      } else {
        const data = await res.json().catch(() => ({}));
        pushToast('error', data.error || 'Could not update recurring transaction.');
      }
    } catch (err) {
      console.error('Error toggling recurring transaction:', err);
      pushToast('error', 'Could not update. Check your connection.');
    }
  };

  const handleDelete = (item) => {
    askConfirm({
      title: 'Delete recurring transaction?',
      message: `This will stop future "${item.description}" ${FREQUENCY_LABELS[item.frequency]?.toLowerCase() || ''} entries. Transactions already created will not be affected. This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/recurring/${item._id}`, {
            method: 'DELETE',
            headers: { 'x-csrf-token': getCookie('csrfToken') }
          });
          if (res.ok) {
            await fetchItems();
            pushToast('success', 'Recurring transaction deleted.');
          } else {
            const data = await res.json().catch(() => ({}));
            pushToast('error', data.error || 'Could not delete recurring transaction.');
          }
        } catch (err) {
          console.error('Error deleting recurring transaction:', err);
          pushToast('error', 'Could not delete. Check your connection.');
        }
      }
    });
  };

  return (
    <div className="card glass-card table-card" style={{ marginTop: '1.5rem' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Recurring Transactions</h3>
        <button className="btn btn-secondary" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ Add Recurring'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ marginBottom: '1rem' }}>
          <div className="form-row">
            <div className="form-group">
              <label>Description</label>
              <input type="text" name="description" required maxLength={100} placeholder="e.g., Rent" />
            </div>
            <div className="form-group">
              <label>Amount</label>
              <input type="number" name="amount" step="0.01" min="0.01" required placeholder="0.00" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Type</label>
              <select name="type" required defaultValue="expense">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div className="form-group">
              <label>Category</label>
              <input type="text" name="category" required maxLength={50} placeholder="e.g., Housing" list="recurring-categories-list" />
              <datalist id="recurring-categories-list">
                <option value="Housing" />
                <option value="Utilities" />
                <option value="Salary" />
                <option value="Insurance" />
                <option value="Subscriptions" />
              </datalist>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Frequency</label>
              <select name="frequency" required defaultValue="monthly">
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="form-group">
              <label>First run</label>
              <input
                type="date"
                name="nextRunDate"
                required
                defaultValue={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Recurring'}
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading recurring transactions…</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          No recurring transactions yet. Add one for bills or income that repeat.
        </p>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Frequency</th>
                <th>Next run</th>
                <th>Status</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id} style={item.active ? undefined : { opacity: 0.55 }}>
                  <td>{item.description}</td>
                  <td><span className="tx-category-badge">{item.category}</span></td>
                  <td>{FREQUENCY_LABELS[item.frequency] || item.frequency}</td>
                  <td>{formatDate(item.nextRunDate)}</td>
                  <td>
                    <span className={item.active ? 'text-success' : 'text-muted'}>
                      {item.active ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td className="text-right">
                    <span className={item.type === 'income' ? 'text-success' : 'text-danger'}>
                      {formatCurrency(item.amount)}
                    </span>
                  </td>
                  <td className="text-right">
                    <button className="btn btn-text" onClick={() => handleToggleActive(item)}>
                      {item.active ? 'Pause' : 'Resume'}
                    </button>
                    <button className="btn btn-text text-danger" onClick={() => handleDelete(item)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
