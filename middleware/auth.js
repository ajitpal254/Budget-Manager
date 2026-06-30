const Session = require('../models/Session');
const User = require('../models/User');

// Helper to manually parse cookies since we don't have cookie-parser installed
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

const authMiddleware = async (req, res, next) => {
  try {
    // 1. Manually attach cookies to req
    req.cookies = parseCookies(req.headers.cookie);

    // 2. CSRF Protection for state-changing HTTP requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const csrfTokenCookie = req.cookies['csrfToken'];
      const csrfTokenHeader = req.headers['x-csrf-token'];

      if (!csrfTokenCookie || !csrfTokenHeader || csrfTokenCookie !== csrfTokenHeader) {
        return res.status(403).json({ error: 'CSRF token validation failed.' });
      }
    }

    // 3. Verify Session Token
    const token = req.cookies['sessionToken'];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required. No session token provided.' });
    }

    const session = await Session.findOne({ token });
    if (!session || session.expiresAt < new Date()) {
      // Invalidate session if it's expired but still in db
      if (session) await Session.deleteOne({ _id: session._id });
      return res.status(401).json({ error: 'Session expired or invalid.' });
    }

    const user = await User.findById(session.userId).select('-passwordHash -passwordSalt');
    if (!user) {
      return res.status(401).json({ error: 'User associated with this session no longer exists.' });
    }

    // Attach user and session to request
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
  parseCookies
};
