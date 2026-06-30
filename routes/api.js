const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Goal = require('../models/Goal');
const User = require('../models/User');
const Session = require('../models/Session');
const { authMiddleware, parseCookies } = require('../middleware/auth');

// Helper wrapper for async routes to catch errors and pass to Express handler
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Cryptographic helpers
const hashPassword = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
};

const generateSalt = () => {
  return crypto.randomBytes(16).toString('hex');
};

const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Cookie utilities
const setAuthCookies = (res, sessionToken, csrfToken) => {
  const isProd = process.env.NODE_ENV === 'production';
  
  res.cookie('sessionToken', sessionToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.cookie('csrfToken', csrfToken, {
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie('sessionToken');
  res.clearCookie('csrfToken');
};

// --- AUTH ROUTES ---

// POST /api/auth/register
router.post('/auth/register', asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // Validation
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
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
    passwordSalt: salt
  });
  await newUser.save();

  // Create session automatically upon registration
  const sessionToken = generateToken();
  const csrfToken = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const session = new Session({
    userId: newUser._id,
    token: sessionToken,
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
router.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    // Prevent username enumeration by returning a generic error
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const computedHash = hashPassword(password, user.passwordSalt);
  if (computedHash !== user.passwordHash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const sessionToken = generateToken();
  const csrfToken = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const session = new Session({
    userId: user._id,
    token: sessionToken,
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
  // If user has a session cookie, try to destroy it in the db
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['sessionToken'];
  if (token) {
    await Session.deleteOne({ token });
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
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({ user: req.user });
}));

// --- TRANSACTIONS (SCOPED TO AUTH USER) ---

router.get('/transactions', authMiddleware, asyncHandler(async (req, res) => {
  const transactions = await Transaction.find({ userId: req.user._id }).sort({ date: -1 });
  res.json(transactions);
}));

router.post('/transactions', authMiddleware, asyncHandler(async (req, res) => {
  const { description, amount, type, category, date } = req.body;
  const transaction = new Transaction({
    userId: req.user._id,
    description,
    amount,
    type,
    category,
    date
  });
  const saved = await transaction.save();
  res.status(201).json(saved);
}));

router.put('/transactions/:id', authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { description, amount, type, category, date } = req.body;
  
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

module.exports = router;
