// Recurring transaction helpers.
//
// Recurring entries are generated lazily (no scheduler process): whenever the
// user signs in or loads transaction data, `runDueRecurring` materializes a
// Transaction for every active recurring entry whose nextRunDate has passed,
// then advances nextRunDate. A repeat call is a no-op because nextRunDate is
// always pushed past "now" in the same pass that creates the transactions.

const { FREQUENCIES } = require('../models/RecurringTransaction');

// Advance a date by one frequency step. Month/year steps clamp to the last
// day of the target month so Jan 31 -> Feb 28 (not Mar 3) and
// Feb 29 -> Feb 28 on non-leap years.
const addFrequency = (date, frequency) => {
  const d = new Date(date);
  if (frequency === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (frequency === 'biweekly') {
    d.setDate(d.getDate() + 14);
  } else if (frequency === 'monthly') {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  } else if (frequency === 'yearly') {
    const month = d.getMonth();
    d.setFullYear(d.getFullYear() + 1);
    if (d.getMonth() !== month) {
      // Rolled over (Feb 29 -> Mar 1): clamp back to the last day of
      // the intended month.
      d.setDate(0);
    }
  } else {
    throw new Error(`Unknown frequency: ${frequency}`);
  }
  return d;
};

const isValidFrequency = (f) => FREQUENCIES.includes(f);

// Materialize due recurring transactions for a user. Returns the number of
// Transaction documents created. The per-entry iteration cap guards against
// pathological nextRunDate values far in the past.
const runDueRecurring = async (userId) => {
  const RecurringTransaction = require('../models/RecurringTransaction');
  const Transaction = require('../models/Transaction');

  const now = new Date();
  const due = await RecurringTransaction.find({
    userId,
    active: true,
    nextRunDate: { $lte: now }
  });

  let created = 0;
  for (const entry of due) {
    let next = new Date(entry.nextRunDate);
    let guard = 0;
    while (next <= now && guard < 365) {
      await Transaction.create({
        userId: entry.userId,
        type: entry.type,
        description: entry.description,
        amount: entry.amount,
        category: entry.category,
        date: new Date(next)
      });
      created += 1;
      next = addFrequency(next, entry.frequency);
      guard += 1;
    }
    entry.nextRunDate = next;
    await entry.save();
  }
  return created;
};

module.exports = { addFrequency, isValidFrequency, runDueRecurring, FREQUENCIES };
