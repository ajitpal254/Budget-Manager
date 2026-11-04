// Bill reminders: nudge the user about recurring bills due soon via push.
//
// The finder is pure (testable): findDueBills() returns active recurring
// EXPENSE entries whose nextRunDate falls within the reminder window and
// that have not already been reminded today.
// The sender is impure: sendDueBillReminders() queries the DB, pushes, and
// stamps lastReminderSent so each bill notifies at most once per day.

const RecurringTransaction = require('../models/RecurringTransaction');
const { sendPushToUser } = require('./push');
const logger = require('./logger');

const REMINDER_WINDOW_DAYS = 3;

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();

// Pure: which recurring bills are due soon and still need a reminder?
const findDueBills = (recurringTxs, now = new Date()) => {
  const today = startOfDay(now);
  // End of the third day (inclusive): a bill due at any time on day 3 counts.
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + REMINDER_WINDOW_DAYS);
  windowEnd.setHours(23, 59, 59, 999);

  return (recurringTxs || []).filter((rt) => {
    if (!rt || !rt.active || rt.type !== 'expense') return false;
    const due = new Date(rt.nextRunDate);
    if (Number.isNaN(due.getTime())) return false;
    if (due < today || due > windowEnd) return false;
    if (rt.lastReminderSent && sameDay(rt.lastReminderSent, now)) return false;
    return true;
  });
};

// Impure: find due bills for a user, push one notification per bill, and
// stamp lastReminderSent. Honors the user's billReminders setting (defaults
// to on). Never throws: reminders are best-effort.
const sendDueBillReminders = async (user) => {
  try {
    if (user && user.settings && user.settings.billReminders === false) return 0;
    const today = startOfDay(new Date());
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + REMINDER_WINDOW_DAYS);
    windowEnd.setHours(23, 59, 59, 999);

    const candidates = await RecurringTransaction.find({
      userId: user._id,
      active: true,
      type: 'expense',
      nextRunDate: { $gte: today, $lte: windowEnd }
    });

    const due = findDueBills(candidates);
    let sent = 0;
    for (const bill of due) {
      const dueLabel = new Date(bill.nextRunDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
      await sendPushToUser(user._id, {
        title: 'Bill due soon',
        body: `${bill.description} (${formatMoney(bill.amount)}) is due ${dueLabel}.`,
        url: '/'
      });
      bill.lastReminderSent = new Date();
      await bill.save();
      sent++;
    }
    if (sent > 0) {
      logger.info({ userId: String(user._id), sent }, 'Bill reminders sent');
    }
    return sent;
  } catch (err) {
    logger.error({ err }, 'Bill reminder check failed');
    return 0;
  }
};

const formatMoney = (n) => `$${Number(n).toFixed(2)}`;

module.exports = { findDueBills, sendDueBillReminders, REMINDER_WINDOW_DAYS };
