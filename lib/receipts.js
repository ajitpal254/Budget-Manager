// Receipt upload validation shared by the upload route and the test suite.
//
// Receipts are photos, so only raster image types are accepted. SVG is
// deliberately excluded: the bytes are later served back with an image
// content-type, and an SVG carrying <script> would execute in the app's
// origin when viewed.

// 5 MB cap — keeps MongoDB documents small (Render's disk is ephemeral,
// so receipts live on the Transaction document itself).
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

const ALLOWED_RECEIPT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const isAllowedReceiptType = (mimetype) =>
  typeof mimetype === 'string' && ALLOWED_RECEIPT_TYPES.has(mimetype.toLowerCase());

const isWithinSizeLimit = (size) =>
  Number.isInteger(size) && size > 0 && size <= MAX_RECEIPT_BYTES;

// Returns { ok: true } or { ok: false, status, error } for route use.
const validateReceiptUpload = (file) => {
  if (!file) {
    return { ok: false, status: 400, error: 'No receipt file was uploaded.' };
  }
  if (!isAllowedReceiptType(file.mimetype)) {
    return {
      ok: false,
      status: 400,
      error: 'Receipt must be a photo (JPEG, PNG, WebP, GIF, HEIC).',
    };
  }
  if (!isWithinSizeLimit(file.size)) {
    return {
      ok: false,
      status: 413,
      error: 'Receipt is too large. Maximum size is 5 MB.',
    };
  }
  return { ok: true };
};

module.exports = {
  MAX_RECEIPT_BYTES,
  ALLOWED_RECEIPT_TYPES,
  isAllowedReceiptType,
  isWithinSizeLimit,
  validateReceiptUpload,
};
