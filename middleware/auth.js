const Session = require('../models/Session');
const User = require('../models/User');

// Helper to manually parse cookies
const parseCookies = (cookieHeader) => {
  const cookies = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const name = parts[0].trim();
      const val = (parts.slice(1).join('=') || '').trim();
      cookies[name] = val;
    });
  }
  return cookies;
};

// 1. Rate Limiting Middleware (IP-based, in-memory)
const rateLimitStore = {};
const rateLimitMiddleware = (limit = 150, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();

    if (!rateLimitStore[ip]) {
      rateLimitStore[ip] = [];
    }

    // Clean up outdated timestamps
    rateLimitStore[ip] = rateLimitStore[ip].filter(timestamp => now - timestamp < windowMs);

    if (rateLimitStore[ip].length >= limit) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    rateLimitStore[ip].push(now);
    next();
  };
};

// 2. CSRF Verification Middleware (Double Submit Cookie validation)
const csrfMiddleware = (req, res, next) => {
  // Ensure cookies are parsed
  if (!req.cookies) {
    req.cookies = parseCookies(req.headers.cookie);
  }

  // Safe HTTP methods do not require CSRF token checks
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const csrfTokenCookie = req.cookies['csrfToken'];
  const csrfTokenHeader = req.headers['x-csrf-token'];

  if (!csrfTokenCookie || !csrfTokenHeader || csrfTokenCookie !== csrfTokenHeader) {
    return res.status(403).json({ error: 'CSRF token validation failed.' });
  }

  next();
};

// 3. User Session Authentication Middleware
const authMiddleware = async (req, res, next) => {
  try {
    if (!req.cookies) {
      req.cookies = parseCookies(req.headers.cookie);
    }

    const token = req.cookies['sessionToken'];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const session = await Session.findOne({ token });
    if (!session || session.expiresAt < new Date()) {
      if (session) await Session.deleteOne({ _id: session._id });
      return res.status(401).json({ error: 'Session expired or invalid.' });
    }

    const user = await User.findById(session.userId).select('-passwordHash -passwordSalt');
    if (!user) {
      return res.status(401).json({ error: 'User does not exist.' });
    }

    req.user = user;
    req.session = session;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'An error occurred during authentication.' });
  }
};

module.exports = {
  authMiddleware,
  csrfMiddleware,
  rateLimitMiddleware,
  parseCookies
};
