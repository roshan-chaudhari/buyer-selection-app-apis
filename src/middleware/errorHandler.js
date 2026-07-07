/**
 * ============================================================
 * GLOBAL ERROR HANDLER MIDDLEWARE
 * ============================================================
 * Must be registered LAST in Express (after all routes).
 * Catches any error forwarded via next(err) — including errors
 * thrown inside asyncHandler-wrapped controllers.
 *
 * Handles:
 *  - Generic errors (message + optional stack in dev)
 *  - MySQL2 duplicate entry          (ER_DUP_ENTRY)
 *  - MySQL2 null constraint          (ER_BAD_NULL_ERROR)
 *  - MySQL2 foreign key violation    (ER_ROW_IS_REFERENCED_2)
 *  - MySQL2 data too long            (ER_DATA_TOO_LONG)
 *  - Custom errors with statusCode   (err.statusCode)
 */

const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';

  // ── MySQL2 Errors ────────────────────────────────────────────
  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 400;
    message = 'A record with this value already exists.';
  }

  if (err.code === 'ER_BAD_NULL_ERROR') {
    statusCode = 400;
    // Try to extract the column name from the MySQL message
    const match = err.message.match(/Column '(.+?)'/i);
    message = match ? `${match[1]} is required.` : 'A required field is missing.';
  }

  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_NO_REFERENCED_ROW_2') {
    statusCode = 400;
    message = 'This record is linked to other data and cannot be modified.';
  }

  if (err.code === 'ER_DATA_TOO_LONG') {
    statusCode = 400;
    const match = err.message.match(/column '(.+?)'/i);
    const field = match ? match[1] : 'field';
    message = `The entered value is too long for the ${field} field.`;
  }

  // ── Log the error ────────────────────────────────────────────
  console.error(`[ERROR] [${req.method}] ${req.originalUrl} — ${message}`, {
    code: err.code,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });

  // ── Send response using res.fail if responseHandler is loaded ─
  if (typeof res.fail === 'function') {
    return res.fail(message, statusCode);
  }

  // ── Fallback if responseHandler is not active ─────────────────
  return res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV !== 'production' ? { stack: err.stack } : null,
    timestamp: new Date().toISOString(),
  });
};

module.exports = { errorHandler };
