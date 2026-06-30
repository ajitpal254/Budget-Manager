require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const { parseCookies, rateLimitMiddleware, csrfMiddleware } = require('./middleware/auth');

const app = express();
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
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self'; " + // No unsafe-inline for scripts
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " + // Google fonts style
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data:;"
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
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'An internal server error occurred.' });
});

// Self-contained migration script to assign existing records to the default user
async function runMigrations() {
  try {
    const User = require('./models/User');
    const Transaction = require('./models/Transaction');
    const Budget = require('./models/Budget');
    const Goal = require('./models/Goal');
    const crypto = require('crypto');

    // 1. Create Default User (Ajit Pal)
    let user = await User.findOne({ email: 'testingpurposeap@gmail.com' });
    if (!user) {
      console.log('Migration: Creating default user Ajit Pal...');
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync('Qwerty1234', salt, 1000, 64, 'sha512').toString('hex');
      user = new User({
        name: 'Ajit Pal',
        email: 'testingpurposeap@gmail.com',
        passwordHash: hash,
        passwordSalt: salt
      });
      await user.save();
      console.log('Migration: Default user created successfully.');
    }

    // 2. Assign Orphaned Records to Default User
    const resultTx = await Transaction.updateMany({ userId: { $exists: false } }, { $set: { userId: user._id } });
    const resultBudget = await Budget.updateMany({ userId: { $exists: false } }, { $set: { userId: user._id } });
    const resultGoal = await Goal.updateMany({ userId: { $exists: false } }, { $set: { userId: user._id } });

    if (resultTx.modifiedCount > 0 || resultBudget.modifiedCount > 0 || resultGoal.modifiedCount > 0) {
      console.log(`Migration complete: Assigned ${resultTx.modifiedCount} transactions, ${resultBudget.modifiedCount} budgets, and ${resultGoal.modifiedCount} goals to user Ajit Pal.`);
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
