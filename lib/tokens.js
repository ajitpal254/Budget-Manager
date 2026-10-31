const crypto = require('crypto');

// SHA-256 hex digest of a session token. Session tokens are stored hashed
// at rest in MongoDB; the raw token only ever travels inside the httpOnly
// session cookie and is hashed before every database lookup.
const hashToken = (token) => {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
};

module.exports = { hashToken };
