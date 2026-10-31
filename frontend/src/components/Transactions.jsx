import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../api';
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

  return (
    <div className="tab-view active">
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
    </div>
  );
}
