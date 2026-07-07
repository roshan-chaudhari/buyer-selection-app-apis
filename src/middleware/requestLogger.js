/**
 * Logs all incoming HTTP requests with method, path, status code, and response time.
 *
 * Output format:
 *   [METHOD] /path/url 200 — 12ms
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${req.method}] ${req.originalUrl} ${res.statusCode} — ${Date.now() - start}ms`);
  });
  next();
};

module.exports = { requestLogger };
