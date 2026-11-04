// Monthly PDF report (pdfkit): one-page-ish summary of a month's money.
//
// Pure data in, PDF Buffer out. The route handles auth + DB queries.
// Layout: header, summary boxes, spending-by-category table, largest
// expenses, budget status. Kept dependency-free apart from pdfkit.

const PDFDocument = require('pdfkit');

const money = (n) => `$${Number(n).toFixed(2)}`;

// { monthLabel, transactions, budgets } -> Promise<Buffer>
const buildMonthlyReport = ({ monthLabel, transactions, budgets = [] }) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const txs = transactions || [];
    const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const net = income - expenses;

    // --- Header ---
    doc.fontSize(22).fillColor('#111').text('Monthly Money Report', { align: 'center' });
    doc.fontSize(12).fillColor('#666').text(monthLabel, { align: 'center' });
    doc.moveDown(1.5);

    // --- Summary ---
    section(doc, 'Summary');
    doc.fontSize(11).fillColor('#111');
    kv(doc, 'Income', money(income));
    kv(doc, 'Expenses', money(expenses));
    kv(doc, 'Net', money(net), net < 0 ? '#c0392b' : '#1e8449');
    doc.moveDown();

    // --- Spending by category ---
    section(doc, 'Spending by Category');
    const byCat = {};
    txs.filter((t) => t.type === 'expense').forEach((t) => {
      byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    if (cats.length === 0) {
      doc.fontSize(11).fillColor('#666').text('No expenses this month.');
    } else {
      doc.fontSize(11).fillColor('#111');
      cats.forEach(([cat, amt]) => {
        const pct = expenses > 0 ? ` (${Math.round((amt / expenses) * 100)}%)` : '';
        kv(doc, cat, money(amt) + pct);
      });
    }
    doc.moveDown();

    // --- Largest expenses ---
    section(doc, 'Largest Expenses');
    const largest = txs
      .filter((t) => t.type === 'expense')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    if (largest.length === 0) {
      doc.fontSize(11).fillColor('#666').text('None.');
    } else {
      doc.fontSize(11).fillColor('#111');
      largest.forEach((t, i) => kv(doc, `${i + 1}. ${t.description}`, money(t.amount)));
    }
    doc.moveDown();

    // --- Budget status ---
    section(doc, 'Budget Status');
    if (!budgets || budgets.length === 0) {
      doc.fontSize(11).fillColor('#666').text('No budgets configured.');
    } else {
      doc.fontSize(11).fillColor('#111');
      budgets.forEach((b) => {
        const spent = txs
          .filter((t) => t.type === 'expense' && t.category === b.category)
          .reduce((s, t) => s + t.amount, 0);
        const pct = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
        const over = spent > b.limit;
        kv(doc, b.category, `${money(spent)} of ${money(b.limit)} (${pct}%)`, over ? '#c0392b' : '#111');
      });
    }

    doc.end();
  });
};

const section = (doc, title) => {
  doc.fontSize(14).fillColor('#111').text(title, { underline: true });
  doc.moveDown(0.4);
};

const kv = (doc, key, value, color) => {
  doc.fillColor('#111').text(key, { continued: true });
  doc.fillColor(color || '#111').text(`  ${value}`);
};

module.exports = { buildMonthlyReport };
