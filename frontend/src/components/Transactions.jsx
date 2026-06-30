import React, { useState, useMemo } from 'react';

export default function Transactions({ transactions, formatCurrency, formatDate, onEdit, onDelete }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Retrieve unique categories in dataset
  const categories = useMemo(() => {
    return Array.from(new Set(transactions.map(t => t.category)));
  }, [transactions]);

  // Apply filters in memory
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = t.description.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'all' || t.type === typeFilter;
      const matchesCategory = categoryFilter === 'all' || t.category.toLowerCase() === categoryFilter.toLowerCase();
      return matchesSearch && matchesType && matchesCategory;
    });
  }, [transactions, search, typeFilter, categoryFilter]);

  // Pagination bounds math
  const totalItems = filteredTransactions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  
  const activePage = currentPage > totalPages ? totalPages : currentPage;

  const startIndex = (activePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pageItems = filteredTransactions.slice(startIndex, endIndex);

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
              {pageItems.map((t, idx) => (
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
              {pageItems.length === 0 && (
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
            {totalItems > 0
              ? `Showing ${startIndex + 1}-${endIndex} of ${totalItems} transactions`
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
    </div>
  );
}
