const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Goal = require('../models/Goal');
const User = require('../models/User');
const Session = require('../models/Session');
const PushSubscription = require('../models/PushSubscription');
const { sendPushToUser } = require('../lib/push');
const { hashToken } = require('../lib/tokens');
const { authMiddleware, parseCookies, rateLimitMiddleware } = require('../middleware/auth');

// Helper wrapper for async routes to catch errors and pass to Express handler
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Cryptographic helpers
// OWASP recommends >= 310,000 iterations for PBKDF2-HMAC-SHA512.
const PBKDF2_ITERATIONS = 310000;
// Iteration count used before the hardening upgrade; kept so legacy hashes
// can still be verified (and upgraded on next successful login).
const LEGACY_PBKDF2_ITERATIONS = 1000;
const hashPassword = (password, salt, iterations = PBKDF2_ITERATIONS) => {
  return crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
};

// Constant-time comparison so hash validity isn't leaked via response timing.
const safeHashEquals = (a, b) => {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

// Fixed salt used only to burn PBKDF2 time on the login not-found path, so
// response timing doesn't reveal whether an email is registered.
const DUMMY_SALT = '00000000000000000000000000000000';

const generateSalt = () => {
  return crypto.randomBytes(16).toString('hex');
};

const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Cookie utilities
const setAuthCookies = (res, sessionToken, csrfToken) => {
  const isProd = process.env.NODE_ENV === 'production';
  
  // In production the frontend is served from a different origin (e.g. Netlify)
  // than the API (e.g. Render), so cookies must be SameSite=None; Secure to be
  // sent with cross-origin fetch requests. 'lax' is fine (and safer) for the
  // same-origin local dev setup.
  const sameSite = isProd ? 'none' : 'lax';

  res.cookie('sessionToken', sessionToken, {
    httpOnly: true,
    secure: isProd,
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.cookie('csrfToken', csrfToken, {
    secure: isProd,
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie('sessionToken');
  res.clearCookie('csrfToken');
};

// --- AUTH ROUTES ---

// GET /api/auth/csrf-token (Public endpoint to acquire token for login/register POSTs)
router.get('/auth/csrf-token', (req, res) => {
  const csrfToken = generateToken();
  const isProd = process.env.NODE_ENV === 'production';
  
  res.cookie('csrfToken', csrfToken, {
    secure: isProd,
    // Must match setAuthCookies: cross-origin frontend needs SameSite=None in prod.
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({ csrfToken });
});

// POST /api/auth/register
router.post('/auth/register', asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // Strict type verification to prevent NoSQL query injection attacks
  if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid input format' });
  }

  // Validation
  if (!name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (password.length < 12) {
    return res.status(400).json({ error: 'Password must be at least 12 characters long' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return res.status(400).json({ error: 'Email is already registered' });
  }

  const salt = generateSalt();
  const hash = hashPassword(password, salt);

  const newUser = new User({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: hash,
    passwordSalt: salt,
    hashIterations: PBKDF2_ITERATIONS
  });
  await newUser.save();

  // Create session automatically upon registration
  const sessionToken = generateToken();
  const csrfToken = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const session = new Session({
    userId: newUser._id,
    token: hashToken(sessionToken),
    expiresAt
  });
  await session.save();

  setAuthCookies(res, sessionToken, csrfToken);

  res.status(201).json({
    user: {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email
    },
    message: 'Registered and signed in successfully'
  });
}));

// POST /api/auth/login
// Stricter per-route rate limit (10 attempts / 15 min / IP) on top of the
// global /api limiter, to slow credential stuffing.
router.post('/auth/login', rateLimitMiddleware(10, 15 * 60 * 1000), asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid input format' });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    // Burn the same PBKDF2 cost as a real check so response time doesn't
    // reveal whether the email is registered. Generic error in both cases.
    hashPassword(password, DUMMY_SALT);
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Verify against the iteration count this account's hash was created with,
  // so hashes made before the hardening upgrade still validate.
  const iterations = user.hashIterations || LEGACY_PBKDF2_ITERATIONS;
  const computedHash = hashPassword(password, user.passwordSalt, iterations);
  if (!safeHashEquals(computedHash, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Transparently upgrade legacy/weak hashes to the current iteration count
  // on successful login.
  if (iterations < PBKDF2_ITERATIONS) {
    user.passwordSalt = generateSalt();
    user.passwordHash = hashPassword(password, user.passwordSalt);
    user.hashIterations = PBKDF2_ITERATIONS;
    await user.save();
  }

  const sessionToken = generateToken();
  const csrfToken = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const session = new Session({
    userId: user._id,
    token: hashToken(sessionToken),
    expiresAt
  });
  await session.save();

  setAuthCookies(res, sessionToken, csrfToken);

  res.json({
    user: {
      _id: user._id,
      name: user.name,
      email: user.email
    },
    message: 'Signed in successfully'
  });
}));

// POST /api/auth/logout
router.post('/auth/logout', asyncHandler(async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['sessionToken'];
  if (token) {
    await Session.deleteOne({ token: hashToken(token) });
  }

  clearAuthCookies(res);
  res.json({ message: 'Signed out successfully' });
}));

// GET /api/auth/me
router.get('/auth/me', authMiddleware, asyncHandler(async (req, res) => {
  // On successful validation, generate and refresh CSRF cookie for safety
  const csrfToken = generateToken();
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('csrfToken', csrfToken, {
    secure: isProd,
    // Must match setAuthCookies: cross-origin frontend needs SameSite=None in prod.
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({ user: req.user });
}));

// --- TRANSACTIONS (SCOPED TO AUTH USER) ---

// Escape user input before embedding it in a RegExp.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/transactions', authMiddleware, asyncHandler(async (req, res) => {
  const { page: pageRaw, limit: limitRaw, search, type, category } = req.query;

  const filter = { userId: req.user._id };
  if (type === 'income' || type === 'expense') {
    filter.type = type;
  }
  if (typeof category === 'string' && category.trim()) {
    // Case-insensitive exact match, preserving the old client-side behavior.
    filter.category = { $regex: `^${escapeRegExp(category.trim())}$`, $options: 'i' };
  }
  if (typeof search === 'string' && search.trim()) {
    filter.description = { $regex: escapeRegExp(search.trim()), $options: 'i' };
  }

  // Backward compatibility: without page/limit params the endpoint returns
  // the plain array exactly as before (the Dashboard aggregates need it all).
  if (pageRaw === undefined && limitRaw === undefined) {
    const transactions = await Transaction.find(filter).sort({ date: -1 });
    return res.json(transactions);
  }

  let page = parseInt(pageRaw, 10);
  let limit = parseInt(limitRaw, 10);
  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(limit) || limit < 1) limit = 20;
  limit = Math.min(limit, 100);

  const total = await Transaction.countDocuments(filter);
  const transactions = await Transaction.find(filter)
    .sort({ date: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  res.json({ transactions, total, page, limit });
}));

// Checks whether a newly saved expense pushed its category's total spend
// across the user's warning/danger budget thresholds (their settings, or
// the 80/100 defaults), and notifies the user's subscribed devices if so.
// Resolves silently when there is no budget for the category or no
// threshold was crossed.
async function checkBudgetThreshold(savedTx) {
  const budget = await Budget.findOne({
    userId: savedTx.userId,
    category: savedTx.category
  });
  if (!budget || !(budget.limit > 0)) return;

  // Per-user thresholds; fall back to 80/100 when the user never set them.
  const user = await User.findById(savedTx.userId).select('settings').lean();
  const warningPct = user?.settings?.budgetWarningPct ?? 80;
  const dangerPct = user?.settings?.budgetDangerPct ?? 100;

  const agg = await Transaction.aggregate([
    { $match: { userId: savedTx.userId, type: 'expense', category: savedTx.category } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const total = agg.length ? agg[0].total : 0;
  const pctBefore = ((total - savedTx.amount) / budget.limit) * 100;
  const pctNow = (total / budget.limit) * 100;

  const crossedWarning = pctBefore < warningPct && pctNow >= warningPct;
  const crossedDanger = pctBefore < dangerPct && pctNow >= dangerPct;
  if (!crossedWarning && !crossedDanger) return;

  const over = crossedDanger;
  await sendPushToUser(savedTx.userId, {
    title: over
      ? `Budget alert: ${savedTx.category} over limit`
      : `Budget alert: ${savedTx.category} at ${Math.round(pctNow)}%`,
    body: over
      ? `You've spent ${total.toFixed(2)} of your ${budget.limit.toFixed(2)} budget.`
      : `You've used ${Math.round(pctNow)}% of your ${budget.limit.toFixed(2)} budget.`,
    url: '/'
  });
}

router.post('/transactions', authMiddleware, asyncHandler(async (req, res) => {
  const { description, amount, type, category, date } = req.body;
  
  if (typeof description !== 'string' || typeof category !== 'string' || typeof type !== 'string') {
    return res.status(400).json({ error: 'Invalid input fields format' });
  }

  const transaction = new Transaction({
    userId: req.user._id,
    description,
    amount,
    type,
    category,
    date
  });
  const saved = await transaction.save();

  // Fire-and-forget budget alert: if this expense newly pushes the
  // category's total spend across 80% or 100% of its budget limit,
  // notify the user's subscribed devices. Never blocks the response.
  if (saved.type === 'expense') {
    checkBudgetThreshold(saved).catch(err =>
      console.error('Budget push check failed:', err)
    );
  }

  res.status(201).json(saved);
}));

router.put('/transactions/:id', authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { description, amount, type, category, date } = req.body;
  
  if (typeof description !== 'string' || typeof category !== 'string' || typeof type !== 'string') {
    return res.status(400).json({ error: 'Invalid input fields format' });
  }

  const updated = await Transaction.findOneAndUpdate(
    { _id: id, userId: req.user._id },
    { description, amount, type, category, date },
    { new: true, runValidators: true }
  );
  
  if (!updated) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  res.json(updated);
}));

router.delete('/transactions/:id', authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await Transaction.findOneAndDelete({ _id: id, userId: req.user._id });
  if (!deleted) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  res.json({ message: 'Transaction deleted successfully' });
}));

// --- BUDGETS (SCOPED TO AUTH USER) ---

router.get('/budgets', authMiddleware, asyncHandler(async (req, res) => {
  const budgets = await Budget.find({ userId: req.user._id });
  res.json(budgets);
}));

router.post('/budgets', authMiddleware, asyncHandler(async (req, res) => {
  const { category, limit } = req.body;
  if (!category || typeof category !== 'string' || !category.trim()) {
    return res.status(400).json({ error: 'Category is required and must be a string' });
  }
  
  // Upsert budget limit for a category scoped to the specific user
  const budget = await Budget.findOneAndUpdate(
    { category: category.trim(), userId: req.user._id },
    { limit },
    { new: true, upsert: true, runValidators: true }
  );
  res.json(budget);
}));

router.delete('/budgets/:id', authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await Budget.findOneAndDelete({ _id: id, userId: req.user._id });
  if (!deleted) {
    return res.status(404).json({ error: 'Budget not found' });
  }
  res.json({ message: 'Budget deleted successfully' });
}));

// --- GOALS (SCOPED TO AUTH USER) ---

router.get('/goals', authMiddleware, asyncHandler(async (req, res) => {
  const goals = await Goal.find({ userId: req.user._id });
  res.json(goals);
}));

router.post('/goals', authMiddleware, asyncHandler(async (req, res) => {
  const { name, target, current, deadline } = req.body;
  
  if (typeof name !== 'string') {
    return res.status(400).json({ error: 'Invalid name format' });
  }

  const goal = new Goal({
    userId: req.user._id,
    name,
    target,
    current,
    deadline
  });
  const saved = await goal.save();
  res.status(201).json(saved);
}));

router.put('/goals/:id', authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, target, current, deadline } = req.body;
  
  if (typeof name !== 'string') {
    return res.status(400).json({ error: 'Invalid name format' });
  }

  const updated = await Goal.findOneAndUpdate(
    { _id: id, userId: req.user._id },
    { name, target, current, deadline },
    { new: true, runValidators: true }
  );
  
  if (!updated) {
    return res.status(404).json({ error: 'Goal not found' });
  }
  res.json(updated);
}));

router.delete('/goals/:id', authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await Goal.findOneAndDelete({ _id: id, userId: req.user._id });
  if (!deleted) {
    return res.status(404).json({ error: 'Goal not found' });
  }
  res.json({ message: 'Goal deleted successfully' });
}));

// --- PUSH NOTIFICATIONS ---

// Public: the client needs the VAPID public key before it can subscribe.
// 503 when push isn't configured so the UI can hide the opt-in.
router.get('/push/vapid-public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Push notifications are not configured.' });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Save (or refresh) a device's push subscription. Upserted by endpoint so
// re-subscribing from the same device never creates duplicates.
router.post('/push/subscribe', authMiddleware, asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (
    typeof endpoint !== 'string' || !endpoint ||
    !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid push subscription.' });
  }
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { userId: req.user._id, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    { upsert: true, new: true }
  );
  res.status(201).json({ message: 'Push subscription saved.' });
}));

// Remove a device's push subscription (e.g. when the user opts out).
router.delete('/push/unsubscribe', authMiddleware, asyncHandler(async (req, res) => {
  const { endpoint } = req.body || {};
  if (typeof endpoint !== 'string' || !endpoint) {
    return res.status(400).json({ error: 'Invalid endpoint.' });
  }
  await PushSubscription.deleteOne({ endpoint, userId: req.user._id });
  res.json({ message: 'Push subscription removed.' });
}));

// --- USER PROFILE & SETTINGS ---

// GET /api/user/profile (auth) — public profile fields. Email is read-only:
// it's the login identity and can never be changed through the API.
router.get('/user/profile', authMiddleware, asyncHandler(async (req, res) => {
  res.json({
    name: req.user.name,
    email: req.user.email,
    createdAt: req.user.createdAt
  });
}));

// PATCH /api/user/profile (auth + CSRF) — updates the display name only.
router.patch('/user/profile', authMiddleware, asyncHandler(async (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    return res.status(400).json({ error: 'Name must be between 1 and 100 characters.' });
  }
  const updated = await User.findOneAndUpdate(
    { _id: req.user._id },
    { $set: { name: name.trim() } },
    { new: true, runValidators: true }
  );
  res.json({ name: updated.name, email: updated.email });
}));

// POST /api/user/change-password (auth + CSRF) — verifies the current
// password, rehashes with the current PBKDF2 params, and closes every other
// session so a changed password actually locks out other devices.
router.post('/user/change-password', authMiddleware, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Invalid input format' });
  }
  if (newPassword.length < 12) {
    return res.status(400).json({ error: 'New password must be at least 12 characters long' });
  }

  // Need the full document (authMiddleware strips the password fields).
  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(401).json({ error: 'User does not exist.' });
  }
  const iterations = user.hashIterations || LEGACY_PBKDF2_ITERATIONS;
  const computedHash = hashPassword(currentPassword, user.passwordSalt, iterations);
  if (!safeHashEquals(computedHash, user.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  user.passwordSalt = generateSalt();
  user.passwordHash = hashPassword(newPassword, user.passwordSalt);
  user.hashIterations = PBKDF2_ITERATIONS;
  await user.save();

  // Keep only the current session; every other device is signed out.
  const cookies = parseCookies(req.headers.cookie);
  const currentToken = cookies['sessionToken'];
  const keepHashed = currentToken ? [hashToken(currentToken)] : [];
  const result = await Session.deleteMany({
    userId: user._id,
    token: { $nin: keepHashed }
  });
  res.json({ message: 'Password changed successfully.', otherSessionsClosed: result.deletedCount });
}));

// GET /api/user/settings (auth) — budget alert thresholds, 80/100 when unset.
router.get('/user/settings', authMiddleware, asyncHandler(async (req, res) => {
  const s = req.user.settings || {};
  res.json({
    budgetWarningPct: s.budgetWarningPct ?? 80,
    budgetDangerPct: s.budgetDangerPct ?? 100
  });
}));

// PATCH /api/user/settings (auth + CSRF) — accepts one or both thresholds;
// missing fields keep their current values. Warning must stay below danger.
router.patch('/user/settings', authMiddleware, asyncHandler(async (req, res) => {
  const { budgetWarningPct, budgetDangerPct } = req.body || {};
  const cur = req.user.settings || {};
  const w = budgetWarningPct === undefined ? (cur.budgetWarningPct ?? 80) : Number(budgetWarningPct);
  const d = budgetDangerPct === undefined ? (cur.budgetDangerPct ?? 100) : Number(budgetDangerPct);
  if (!Number.isFinite(w) || !Number.isFinite(d) || w < 1 || w > 100 || d < 1 || d > 100) {
    return res.status(400).json({ error: 'Thresholds must be numbers between 1 and 100.' });
  }
  if (!(w < d)) {
    return res.status(400).json({ error: 'Warning threshold must be less than the danger threshold.' });
  }
  await User.updateOne(
    { _id: req.user._id },
    { $set: { 'settings.budgetWarningPct': w, 'settings.budgetDangerPct': d } },
    { runValidators: true }
  );
  res.json({ budgetWarningPct: w, budgetDangerPct: d });
}));

// POST /api/user/logout-all (auth + CSRF) — closes every session except the
// current one, identified by hashing the presented cookie like logout does.
router.post('/user/logout-all', authMiddleware, asyncHandler(async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const currentToken = cookies['sessionToken'];
  const keepHashed = currentToken ? [hashToken(currentToken)] : [];
  const result = await Session.deleteMany({
    userId: req.user._id,
    token: { $nin: keepHashed }
  });
  res.json({ message: 'Signed out of all other devices.', sessionsClosed: result.deletedCount });
}));

module.exports = router;
