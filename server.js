require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const { parseCookies, rateLimitMiddleware, csrfMiddleware } = require('./middleware/auth');

const app = express();
app.disable('x-powered-by'); // Don't leak the framework/version in response headers
// Render sits behind a reverse proxy: trust the first hop so req.ip is the
// real client IP (the rate limiter keys on it) instead of the proxy address.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/budget-manager';

// Establish connection to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB.');
    runMigrations();
  })
  .catch((err) => {
    console.error('CRITICAL: MongoDB connection error. Make sure your database is running.', err);
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
  credentials: true // Allow session cookies over CORS
};
app.use(cors(corsOptions));

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

// Serve frontend static assets from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Secure API routes with rate limiter and CSRF middlewares
app.use('/api', rateLimitMiddleware());
app.use('/api', csrfMiddleware);
app.use('/api', apiRoutes);

// Catch-all route to serve the SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Express Central Error Handler
app.use((err, req, res, _next) => {
  console.error('Unhandled Server Error:', err);
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
        console.warn('Migration: SEED_DEFAULT_USER=true but SEED_USER_EMAIL / SEED_USER_PASSWORD (min 12 chars) are not set. Skipping seed.');
      } else {
        user = await User.findOne({ email: seedEmail });
        if (!user) {
          console.log('Migration: Creating seed user...');
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
          console.log('Migration: Seed user created successfully.');
        } else {
          // User already exists (e.g. created by an older version): refresh the
          // password from env when it differs, so .env stays the source of truth.
          const iterations = user.hashIterations || 1000;
          const currentHash = crypto.pbkdf2Sync(seedPassword, user.passwordSalt, iterations, 64, 'sha512').toString('hex');
          if (!safeHashEquals(currentHash, user.passwordHash)) {
            console.log('Migration: Seed user exists — updating password from env...');
            const salt = crypto.randomBytes(16).toString('hex');
            user.passwordSalt = salt;
            user.passwordHash = crypto.pbkdf2Sync(seedPassword, salt, 310000, 64, 'sha512').toString('hex');
            user.hashIterations = 310000;
            await user.save();
            console.log('Migration: Seed user password updated.');
          } else {
            console.log('Migration: Seed user already up to date.');
          }
        }
      }
    }

    // 2. Assign orphaned records to the seeded user (only when one exists)
    if (!user) {
      console.log('Migration: No seed user configured; skipping orphan-record assignment.');
      return;
    }

    const resultTx = await Transaction.updateMany({ userId: { $exists: false } }, { $set: { userId: user._id } });
    const resultBudget = await Budget.updateMany({ userId: { $exists: false } }, { $set: { userId: user._id } });
    const resultGoal = await Goal.updateMany({ userId: { $exists: false } }, { $set: { userId: user._id } });

    if (resultTx.modifiedCount > 0 || resultBudget.modifiedCount > 0 || resultGoal.modifiedCount > 0) {
      console.log(`Migration complete: Assigned ${resultTx.modifiedCount} transactions, ${resultBudget.modifiedCount} budgets, and ${resultGoal.modifiedCount} goals to seed user.`);
    } else {
      console.log('Migration: No orphaned records to assign.');
    }
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

// Bind server strictly to loopback interface 127.0.0.1 in dev/testing, bind to 0.0.0.0 in prod
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
app.listen(PORT, host, () => {
  console.log(`Budget Manager server running on http://${host}:${PORT}`);
});
