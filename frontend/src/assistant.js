// In-app assistant — answers questions about the user's money and about how
// to use the app. Pure functions over local data: no network, no dependencies.
//
// answerQuestion(text, ctx) -> reply string. ctx = { transactions, budgets, insights }.
// Answers are short (2-4 sentences), plain language, no markdown.

import { generateInsights, fmt } from './insights.js';

function validTx(ctx) {
  const list = ctx && Array.isArray(ctx.transactions) ? ctx.transactions : [];
  return list.filter(
    (t) =>
      t &&
      (t.type === 'income' || t.type === 'expense') &&
      Number.isFinite(Number(t.amount))
  );
}

function expenses(ctx) {
  return validTx(ctx).filter((t) => t.type === 'expense');
}

function inCurrentMonth(t) {
  const d = new Date(t.date);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function sum(list) {
  return list.reduce((s, t) => s + Number(t.amount), 0);
}

function describe(t) {
  const d = (t.description || 'An entry').trim() || 'An entry';
  return d;
}

const HOWTOS = [
  {
    keys: ['recurring'],
    answer:
      'To set up a recurring transaction, open the Transactions tab and use the Recurring section. Pick weekly, biweekly, monthly or yearly and it will generate itself each time you sign in.',
  },
  {
    keys: ['export', 'csv', 'download'],
    answer:
      'To export your data, open the Transactions tab and tap the Export CSV button in the header. It downloads your full ledger as a spreadsheet-ready file.',
  },
  {
    keys: ['budget'],
    answer:
      'To manage budgets, open the Category Budgets tab. You can create a spending limit per category, edit it, or delete it. The dashboard warns you as spending approaches the limit.',
  },
  {
    keys: ['goal'],
    answer:
      'To track a savings goal, open the Saving Goals tab and create one with a target amount. Log contributions there and watch the progress bar fill up.',
  },
  {
    keys: ['push', 'notification', 'alert'],
    answer:
      'To get budget alerts on this device, tap Enable on the notification banner at the top of the app, or use the toggle in the Profile & Settings tab. You need to accept the browser permission when asked.',
  },
  {
    keys: ['password'],
    answer:
      'To change your password, open the Profile & Settings tab and use the change-password form. You will need your current password, and your other devices get signed out automatically.',
  },
  {
    keys: ['profile', 'account', 'name', 'email'],
    answer:
      'Your profile lives in the Profile & Settings tab. You can edit your display name there; your email address is your login and cannot be changed.',
  },
  {
    keys: ['theme', 'dark mode', 'light mode', 'darkmode'],
    answer:
      'To switch themes, tap the sun/moon button in the top bar. Your choice is remembered on this device.',
  },
  {
    keys: ['offline'],
    answer:
      'If you lose connection, new transactions are queued on your device and sync automatically when you are back online. You will see a pending count in the Transactions tab until they sync.',
  },
  {
    keys: ['receipt', 'photo', 'picture', 'scan'],
    answer:
      'To attach a receipt, open the Add/Edit transaction form and use the Attach receipt field — you can take a photo right from your phone. The app reads the photo and autofills the merchant, amount, date and a suggested category (always verify before saving). The photo is compressed on your device before upload. In the ledger, a receipt icon on a row opens the full image.',
  },
  {
    keys: ['delete'],
    answer:
      'To delete a transaction, budget or goal, find it in its tab and choose delete — the app will ask you to confirm first.',
  },
  {
    keys: ['edit'],
    answer:
      'To edit something, open it from its tab (Transactions, Budgets or Goals), make your changes and save.',
  },
  {
    keys: ['add', 'create', 'new transaction'],
    answer:
      'To add a transaction, tap the Add Transaction button in the top bar, fill in the details and save. It appears in your ledger immediately.',
  },
];

function howToAnswer(q) {
  for (const h of HOWTOS) {
    if (h.keys.some((k) => q.includes(k))) return h.answer;
  }
  return null;
}

function costCuttingAnswer(ctx) {
  const insights =
    ctx && Array.isArray(ctx.insights)
      ? ctx.insights
      : generateInsights(ctx.transactions, ctx.budgets);
  const useful = insights.filter((i) => i.id !== 'getting-started').slice(0, 3);
  if (useful.length === 0) {
    return 'Add a few transactions first and I will analyse your spending and suggest concrete ways to cut costs.';
  }
  const lines = useful.map((i) => `${i.title}. ${i.detail}`);
  return `Here are your top money-saving opportunities right now: ${lines.join(' ')}`;
}

function dataAnswer(q, ctx) {
  const exps = expenses(ctx);

  // "how much did I spend on <category>"
  let m = q.match(/how much did i spend on (.+?)(\?|$)/);
  if (!m) m = q.match(/spent on (.+?)(\?|$)/);
  if (m) {
    const needle = m[1].trim().toLowerCase();
    const cats = {};
    exps.forEach((t) => {
      const c = (t.category || '').trim();
      cats[c.toLowerCase()] = c;
    });
    const match = Object.keys(cats).find(
      (c) => c.includes(needle) || needle.includes(c)
    );
    if (!match) {
      return `I couldn't find a category matching "${m[1].trim()}". Your categories are: ${Object.values(cats).join(', ') || 'none yet'}.`;
    }
    const total = sum(exps.filter((t) => (t.category || '').trim().toLowerCase() === match));
    const monthTotal = sum(
      exps.filter(
        (t) =>
          (t.category || '').trim().toLowerCase() === match && inCurrentMonth(t)
      )
    );
    return `You've spent ${fmt(total)} on ${cats[match]} in total, including ${fmt(monthTotal)} so far this month.`;
  }

  if (/where did my money go/.test(q)) {
    const month = exps.filter(inCurrentMonth);
    if (month.length === 0) return 'No spending recorded this month yet.';
    const byCat = {};
    month.forEach((t) => {
      const c = (t.category || '').trim() || 'Uncategorized';
      byCat[c] = (byCat[c] || 0) + Number(t.amount);
    });
    const top = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return `This month you've spent ${fmt(sum(month))}. Biggest areas: ${top
      .map(([c, a]) => `${c} (${fmt(a)})`)
      .join(', ')}.`;
  }

  if (/biggest expense|largest expense|biggest purchase/.test(q)) {
    if (exps.length === 0) return 'No expenses recorded yet.';
    const b = exps.reduce((a, t) => (Number(t.amount) > Number(a.amount) ? t : a));
    return `Your biggest expense is ${describe(b)} at ${fmt(b.amount)} (${(b.category || 'uncategorized').trim() || 'uncategorized'}).`;
  }

  if (/total spent|spent this month|spending this month|how much.*spend(ing)? this/.test(q)) {
    const total = sum(exps.filter(inCurrentMonth));
    return `You've spent ${fmt(total)} so far this month across ${exps.filter(inCurrentMonth).length} transactions.`;
  }

  if (/over budget|am i over/.test(q)) {
    const budgets = ctx && Array.isArray(ctx.budgets) ? ctx.budgets : [];
    const byCat = {};
    exps.forEach((t) => {
      const c = (t.category || '').trim();
      byCat[c] = (byCat[c] || 0) + Number(t.amount);
    });
    const over = budgets.filter(
      (b) => b && Number(b.limit) > 0 && (byCat[(b.category || '').trim()] || 0) > Number(b.limit)
    );
    if (over.length === 0) {
      return budgets.length === 0
        ? 'You have no budgets set, so there is nothing to be over. Create one in the Category Budgets tab.'
        : 'Good news — none of your budgets are over their limit right now.';
    }
    return `Yes — over budget in: ${over.map((b) => b.category).join(', ')}. Check the dashboard for the exact amounts.`;
  }

  if (/income vs expenses|income and expenses|earn vs spend/.test(q)) {
    const inc = sum(validTx(ctx).filter((t) => t.type === 'income'));
    const exp = sum(exps);
    return `All time: ${fmt(inc)} in, ${fmt(exp)} out, leaving ${fmt(inc - exp)}.`;
  }

  return null;
}

export function answerQuestion(text, ctx) {
  const q = (text || '').toLowerCase().trim();
  if (q === '') return 'Ask me something — for example, "How can I cut costs?" or "How do I add a recurring transaction?"';

  // 1. Cost-cutting advice.
  if (/cut (costs|spending|expenses)|save (money|more)|spend less|reduce (spending|expenses|my spending)/.test(q)) {
    return costCuttingAnswer(ctx || {});
  }

  // 2. Data questions about the user's own money.
  const data = dataAnswer(q, ctx || {});
  if (data) return data;

  // 3. How-to questions about the app.
  const how = howToAnswer(q);
  if (how) return how;

  // 4. Greetings / thanks.
  if (/^(hi|hii+|hello|hey|yo|good (morning|afternoon|evening))\b/.test(q)) {
    return 'Hi! I can look at your spending and suggest ways to save, or explain how anything in the app works. Try "How can I cut costs?"';
  }
  if (/thank|thanks|thx/.test(q)) {
    return "You're welcome! Anything else — money questions or how-tos, I'm here.";
  }

  // 5. Fallback.
  return 'I can help with things like: "How can I cut costs?", "Where did my money go this month?", "How much did I spend on groceries?", or "How do I export my data?"';
}
