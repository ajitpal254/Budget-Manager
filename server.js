require('dotenv').config();
const express = require('express');
const compression = require('compression');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const { parseCookies, rateLimitMiddleware, csrfMiddleware } = require('./middleware/auth');
const logger = require('./lib/logger');
const { requestId, requestLog } = require('./middleware/requestLog');

const app = express();
app.disable('x-powered-by'); // Don't leak the framework/version in response headers
// Render sits behind a reverse proxy: trust the first hop so req.ip is the
// real client IP (the rate limiter keys on it) instead of the proxy address.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/budget-manager';

// Last-resort process handlers: log and fail loudly instead of dying silently.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  process.exit(1);
});

// Establish connection to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    logger.info('Successfully connected to MongoDB.');
    runMigrations();
  })
  .catch((err) => {
    logger.fatal({ err }, 'CRITICAL: MongoDB connection error. Make sure your database is running.');
    process.exit(1); // Exit process on db connection failure
  });

// Basic CORS setup - restrict to localhost and configured frontend origin
const allowedOrigins = [
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-csrf-token'], // Include CSRF header in CORS
  exposedHeaders: ['x-request-id'], // Let the frontend read the request ID for bug reports
  credentials: true // Allow session cookies over CORS
};
app.use(cors(corsOptions));

// Request ID + access logging, mounted first so every request is traced.
app.use(requestId);
app.use(requestLog);

// Manually parse cookies globally before routes are handled
app.use((req, res, next) => {
  req.cookies = parseCookies(req.headers.cookie);
  next();
});

// Request body parsers with limit configuration to prevent DoS
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Implement security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' https://cdn.jsdelivr.net; " + // tesseract.js OCR core (lazy-loaded)
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " + // Google fonts style
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self' https://cdn.jsdelivr.net; " + // tesseract.js language data
    "worker-src 'self' blob:;" // tesseract.js OCR runs in a blob worker
  );
  next();
});

// gzip/deflate responses (JSON, JS, CSS, HTML) — meaningful on slow mobile
// connections. Mounted before the static file server so every response
// benefits.
// Serve frontend static assets from 'public' directory
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));

// Liveness probe for the host (Render health checks, uptime monitors).
// Intentionally before the rate limiter so monitoring never gets throttled.
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    version: process.env.npm_package_version || null
  });
});

// Secure API routes with rate limiter and CSRF middlewares
app.use('/api', rateLimitMiddleware());
app.use('/api', csrfMiddleware);
app.use('/api', apiRoutes);

// Catch-all route to serve the SPA
// NOTE: Express 5 requires named wildcards — bare '*' throws a PathError.
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Express Central Error Handler
// NOTE: the { error: string } response shape is a contract — the frontend
// reads data.error as a string for toasts. Never leak stacks/internals.
app.use((err, req, res, _next) => {
  (req.log || logger).error(
    { err, method: req.method, url: req.originalUrl || req.url },
    'Unhandled server error'
  );
  res.status(500).json({ error: 'An internal server error occurred.' });
});

// Self-contained migration script to assign orphaned records to a seeded user.
//
// SECURITY: The seed user is DISABLED by default. It only runs when explicitly
// enabled via SEED_DEFAULT_USER=true, and credentials must come from the
// SEED_USER_EMAIL / SEED_USER_PASSWORD environment variables — never hardcoded
// (a previous version created a user with a publicly visible password).
async function runMigrations() {
  try {
    const User = require('./models/User');
    const Transaction = require('./models/Transaction');
    const Budget = require('./models/Budget');
    const Goal = require('./models/Goal');
    const crypto = require('crypto');

    // Constant-time hex comparison so hash checks don't leak via timing.
    const safeHashEquals = (a, b) => {
      const bufA = Buffer.from(String(a), 'utf8');
      const bufB = Buffer.from(String(b), 'utf8');
      return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
    };

    let user = null;

    // 1. Optional one-time seed user (opt-in only)
    if (process.env.SEED_DEFAULT_USER === 'true') {
      const seedEmail = (process.env.SEED_USER_EMAIL || '').toLowerCase().trim();
      const seedPassword = process.env.SEED_USER_PASSWORD || '';

      if (!seedEmail || seedPassword.length < 12) {
        logger.warn('Migration: SEED_DEFAULT_USER=true but SEED_USER_EMAIL / SEED_USER_PASSWORD (min 12 chars) are not set. Skipping seed.');
      } else {
        user = await User.findOne({ email: seedEmail });
        if (!user) {
          logger.info('Migration: Creating seed user...');
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = crypto.pbkdf2Sync(seedPassword, salt, 310000, 64, 'sha512').toString('hex');
          user = new User({
            name: 'Seeded User',
            email: seedEmail,
            passwordHash: hash,
            passwordSalt: salt,
            hashIterations: 310000
          });
          await user.save();
          logger.info('Migration: Seed user created successfully.');
        } else {
          // User already exists (e.g. created by an older version): refresh the
          // password from env when it differs, so .env stays the source of truth.
          const iterations = user.hashIterations || 1000;
          const currentHash = crypto.pbkdf2Sync(seedPassword, user.passwordSalt, iterations, 64, 'sha512').toString('hex');
          if (!safeHashEquals(currentHash, user.passwordHash)) {
            logger.info('Migration: Seed user exists — updating password from env...');
            const salt = crypto.randomBytes(16).toString('hex');
            user.passwordSalt = salt;
            user.passwordHash = crypto.pbkdf2Sync(seedPassword, salt, 310000, 64, 'sha512').toString('hex');
            user.hashIterations = 310000;
            await user.save();
            logger.info('Migration: Seed user password updated.');
          } else {
            logger.info('Migration: Seed user already up to date.');
          }
        }
      }
    }

    // 2. Assign orphaned records to the seeded user (only when one exists)
    if (!user) {
      logger.info('Migration: No seed user configured; skipping orphan-record assignment.');
      return;
    }

    const resultTx = await Transaction.updateMany({ userId: { $exists: false } }, { $set: { userId: user._id } });
    const resultBudget = await Budget.updateMany({ userId: { $exists: false } }, { $set: { userId: user._id } });
    const resultGoal = await Goal.updateMany({ userId: { $exists: false } }, { $set: { userId: user._id } });

    if (resultTx.modifiedCount > 0 || resultBudget.modifiedCount > 0 || resultGoal.modifiedCount > 0) {
      logger.info(`Migration complete: Assigned ${resultTx.modifiedCount} transactions, ${resultBudget.modifiedCount} budgets, and ${resultGoal.modifiedCount} goals to seed user.`);
    } else {
      logger.info('Migration: No orphaned records to assign.');
    }
  } catch (err) {
    logger.error({ err }, 'Migration failed');
  }
}

// Bind server strictly to loopback interface 127.0.0.1 in dev/testing, bind to 0.0.0.0 in prod
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
app.listen(PORT, host, () => {
  logger.info(`Budget Manager server running on http://${host}:${PORT}`);
});
