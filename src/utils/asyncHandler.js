/**
 * Wraps an async route handler so that any thrown error
 * is automatically forwarded to the global error handler via next().
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => { ... }));
 */
const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { asyncHandler };
