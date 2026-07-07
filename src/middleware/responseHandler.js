/**
 * ============================================================
 * RESPONSE HANDLER MIDDLEWARE
 * ============================================================
 * Attaches helper methods to `res` so every controller can send
 * a consistent JSON envelope without writing res.status().json()
 * boilerplate manually.
 *
 * Response envelope shape (always the same):
 * {
 *   success  : boolean,
 *   message  : string,
 *   data     : any | null,
 *   error    : { message: string } | null,
 *   meta     : object | null,
 *   timestamp: ISO string
 * }
 *
 * ============================================================
 * AVAILABLE METHODS
 * ============================================================
 *
 *  res.ok(message, data, meta)              → 200 success
 *  res.created(message, data)               → 201 success
 *  res.fail(messageOrError, statusCode)     → failure (default 500)
 *  res.sendResponse(options)                → full control (advanced)
 *
 * ============================================================
 * EXAMPLES
 * ============================================================
 *
 *  // Simple success with data
 *  res.ok('Fetched successfully', projects);
 *
 *  // Success with no data
 *  res.ok('Deleted successfully');
 *
 *  // Created
 *  res.created('Project created', newProject);
 *
 *  // Failure with message string
 *  res.fail('Project not found', 404);
 *
 *  // Failure from a caught error object
 *  res.fail(error, 500);
 *
 * ============================================================
 */

const isDev = () => process.env.NODE_ENV !== 'production';

// Sanitize data: convert undefined → null
const sanitizeData = (data) => (data === undefined ? null : data);

// Sanitize meta: only allow plain objects
const sanitizeMeta = (meta) =>
  meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : null;

/**
 * Sanitize error into a safe, user-facing object.
 * Hides stack traces in production.
 */
const sanitizeError = (error) => {
  if (!error) return null;

  if (typeof error === 'string') {
    return { message: error };
  }

  // MySQL2 duplicate entry error
  if (error.code === 'ER_DUP_ENTRY') {
    return { message: 'A record with this value already exists.' };
  }

  // MySQL2 / generic SQL NULL constraint
  if (error.code === 'ER_BAD_NULL_ERROR') {
    return { message: 'A required field is missing.' };
  }

  // MySQL2 foreign key constraint
  if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_NO_REFERENCED_ROW_2') {
    return { message: 'This record is linked to other data and cannot be modified.' };
  }

  return {
    message: error.message || 'Internal Server Error',
    ...(isDev() && { stack: error.stack }),
  };
};

/**
 * Core builder — all res.* helpers call this.
 */
const buildResponse = (res, { statusCode = 200, success = true, message = '', data = null, error = null, meta = null }) => {
  return res.status(statusCode).json({
    success: Boolean(success),
    message: message || (success ? 'Success' : 'Failed'),
    data: sanitizeData(data),
    error: success ? null : sanitizeError(error),
    meta: sanitizeMeta(meta),
    timestamp: new Date().toISOString(),
  });
};

/**
 * responseHandler middleware
 * Attaches res.ok / res.created / res.fail / res.sendResponse to every response.
 */
const responseHandler = (req, res, next) => {
  /**
   * 200 OK — success with optional data and meta
   * @param {string} message
   * @param {any}    data
   * @param {object} meta  (e.g. pagination info)
   */
  res.ok = (message = 'Success', data = null, meta = null) => {
    return buildResponse(res, { statusCode: 200, success: true, message, data, meta });
  };

  /**
   * 201 Created — use after creating a new resource
   * @param {string} message
   * @param {any}    data
   */
  res.created = (message = 'Created successfully', data = null) => {
    return buildResponse(res, { statusCode: 201, success: true, message, data });
  };

  /**
   * Failure response — pass a message string OR a caught Error object.
   * @param {string|Error} errorOrMessage
   * @param {number}       statusCode   (default 500)
   */
  res.fail = (errorOrMessage = 'Something went wrong', statusCode = 500) => {
    let message = 'Something went wrong';
    let error = errorOrMessage;

    if (typeof errorOrMessage === 'string') {
      message = errorOrMessage;
    } else {
      const sanitized = sanitizeError(errorOrMessage);
      message = sanitized?.message || errorOrMessage?.message || 'Operation failed';
    }

    return buildResponse(res, { statusCode, success: false, message, error });
  };

  /**
   * Full control — use when you need a custom statusCode + envelope (rare).
   * @param {object} options  { statusCode, success, message, data, error, meta }
   */
  res.sendResponse = (options = {}) => buildResponse(res, options);

  next();
};

module.exports = { responseHandler };
