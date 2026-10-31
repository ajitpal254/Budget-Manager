import React, { useState, useEffect, useMemo, useRef } from 'react';
import { apiFetch } from '../api';
import { getPendingCount, onOutboxChange } from '../offlineQueue';
import Recurring from './Recurring';

const PAGE_SIZE = 8;
// The ledger now pages and filters on the server. The `transactions` prop
// (the full array App fetches for the Dashboard/Budgets views) is only used
// to build the complete category dropdown; rows and the pager come from the
// paginated endpoint response.
export default function Transactions({ transactions, formatCurrency, formatDate, onEdit, onDelete, refreshKey, askConfirm, pushToast, onChanged }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  // Offline outbox indicator: re-reads whenever the queue changes.
  const [pendingCount, setPendingCount] = useState(() => getPendingCount());
  useEffect(() => onOutboxChange(() => setPendingCount(getPendingCount())), []);

  // Receipt viewer modal: loads the image bytes on demand (auth cookie).
  const [receiptView, setReceiptView] = useState({ open: false, id: null, description: '' });
  const [receiptUrl, setReceiptUrl] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  const closeReceiptView = () => setReceiptView({ open: false, id: null, description: '' });

  // pushToast identity isn't stable across renders; keep a ref so the
  // receipt-loading effect doesn't refetch on every parent render.
  const pushToastRef = useRef(pushToast);
  pushToastRef.current = pushToast;

  useEffect(() => {
    if (!receiptView.open || !receiptView.id) return;
    let cancelled = false;
    setReceiptLoading(true);
    setReceiptUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    apiFetch(`/api/transactions/${receiptView.id}/receipt`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Receipt load failed: ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        setReceiptUrl(URL.createObjectURL(blob));
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Error loading receipt:', err);
          pushToastRef.current('error', 'Could not load the receipt image.');
          setReceiptView({ open: false, id: null, description: '' });
        }
      })
      .finally(() => { if (!cancelled) setReceiptLoading(false); });
    return () => {
      cancelled = true;
      setReceiptUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [receiptView.open, receiptView.id]);

  // Escape closes the receipt viewer, matching the app's modal behavior.
  useEffect(() => {
    if (!receiptView.open) return;
    const onKey = (e) => { if (e.key === 'Escape') closeReceiptView(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [receiptView.open]);

  // Retrieve unique categories from the full dataset so the filter
  // dropdown stays complete regardless of the current page.
  const categories = useMemo(() => {
    return Array.from(new Set((transactions || []).map(t => t.category)));
  }, [transactions]);

  // Debounce the search input so typing doesn't fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const fetchPage = async () => {
      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: String(PAGE_SIZE),
        });
        if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
        if (typeFilter !== 'all') params.set('type', typeFilter);
        if (categoryFilter !== 'all') params.set('category', categoryFilter);
        const res = await apiFetch(`/api/transactions?${params.toString()}`);
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        // The endpoint returns a paginated envelope when page/limit are set.
        const list = Array.isArray(data) ? data : (data.transactions || []);
        const totalCount = Array.isArray(data) ? list.length : (data.total || 0);
        const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
        if (currentPage > pages && totalCount > 0) {
          // Current page no longer exists (e.g. items were deleted) —
          // step back to the last valid page and refetch.
          setCurrentPage(pages);
          return;
        }
        setRows(list);
        setTotal(totalCount);
      } catch (err) {
        if (!cancelled) console.error('Error fetching transactions:', err);
      }
    };
    fetchPage();
    return () => { cancelled = true; };
  }, [currentPage, debouncedSearch, typeFilter, categoryFilter, refreshKey]);

  // Pagination bounds math (server-provided total)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activePage = Math.min(currentPage, totalPages);

  const startIndex = (activePage - 1) * PAGE_SIZE;

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  const handleTypeChange = (e) => {
    setTypeFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleCategoryChange = (e) => {
    setCategoryFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleExportCsv = async () => {
    try {
      const res = await apiFetch('/api/transactions/export');
      if (!res.ok) throw new Error(`Export failed with status ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="?([^";]+)"?/);
      a.download = match ? match[1] : 'transactions.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      pushToast('success', 'Transactions exported as CSV.');
    } catch (err) {
      console.error('Error exporting transactions:', err);
      pushToast('error', 'Could not export transactions. Check your connection.');
    }
  };

  return (
    <div className="tab-view active">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-secondary" onClick={handleExportCsv}>
          Export CSV
        </button>
      </div>
      {pendingCount > 0 && (
        <div
          role="status"
          style={{
            marginBottom: '1rem',
            padding: '0.6rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            color: 'var(--text-primary)',
            fontSize: '0.9rem'
          }}
        >
          {pendingCount} offline change{pendingCount === 1 ? '' : 's'} pending — will sync when you&rsquo;re back online.
        </div>
      )}
      {/* Filtering Box */}
      <div className="card glass-card filter-card">
        <div className="filter-row">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search description..."
              value={search}
              onChange={handleSearchChange}
              aria-label="Search transactions"
            />
          </div>
          <div className="select-box">
            <select value={typeFilter} onChange={handleTypeChange} aria-label="Filter by type">
              <option value="all">All Types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div className="select-box">
            <select value={categoryFilter} onChange={handleCategoryChange} aria-label="Filter by category">
              <option value="all">All Categories</option>
              {categories.map((cat, idx) => (
                <option key={idx} value={cat.toLowerCase()}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="card glass-card table-card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Type</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, idx) => (
                <tr key={t._id || idx}>
                  <td>{formatDate(t.date)}</td>
                  <td>{t.description}</td>
                  <td>
                    <span className="tx-category-badge">{t.category}</span>
                  </td>
                  <td>
                    <span
                      className={t.type === 'income' ? 'text-success' : 'text-danger'}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td className="text-right">{formatCurrency(t.amount)}</td>
                  <td className="text-right">
                    {t.receipt && t.receipt.contentType && (
                      <button
                        className="btn btn-text"
                        title="View receipt"
                        aria-label={`View receipt for ${t.description}`}
                        onClick={() => setReceiptView({ open: true, id: t._id, description: t.description })}
                      >
                        🧾
                      </button>
                    )}
                    <button className="btn btn-text" onClick={() => onEdit(t)}>
                      Edit
                    </button>
                    <button className="btn btn-text text-danger" onClick={() => onDelete(t._id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No matching transactions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Row */}
        <div className="pagination-controls">
          <span className="pagination-info">
            {total > 0
              ? `Showing ${startIndex + 1}-${startIndex + rows.length} of ${total} transactions`
              : 'No transactions to display'}
          </span>
          <div className="pagination-buttons">
            <button
              className="btn btn-secondary"
              disabled={activePage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
            >
              Previous
            </button>
            <button
              className="btn btn-secondary"
              disabled={activePage === totalPages}
              onClick={() => setCurrentPage(prev => prev + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Recurring templates: managed here, materialized by the backend */}
      <Recurring
        formatCurrency={formatCurrency}
        formatDate={formatDate}
        askConfirm={askConfirm}
        pushToast={pushToast}
        onChanged={onChanged}
      />

      {/* Receipt viewer modal */}
      <div className={`modal ${receiptView.open ? 'show' : ''}`} role="dialog" aria-hidden={!receiptView.open}>
        <div className="modal-content glass-card" style={{ maxWidth: '640px' }}>
          <div className="modal-header">
            <h3>Receipt{receiptView.description ? ` — ${receiptView.description}` : ''}</h3>
            <button className="btn-close" onClick={closeReceiptView}>&times;</button>
          </div>
          <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
            {receiptLoading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
            {!receiptLoading && receiptUrl && (
              <img
                src={receiptUrl}
                alt={`Receipt for ${receiptView.description}`}
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 'var(--radius-md)' }}
              />
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={closeReceiptView}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
