/**
 * Standard success response for JSON API
 * @param {Object} res - Express response object
 * @param {any} data - Data to return
 * @param {number} status - HTTP status code
 * @returns {Object} - Express response
 */
const successResponse = (res, data, status = 200) => {
  return res.status(status).json({
    success: true,
    data
  });
};

/**
 * Standard error response for JSON API
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {Object} error - Error object
 * @param {number} status - HTTP status code
 * @returns {Object} - Express response
 */
const errorResponse = (res, message, error = null, status = 500) => {
  console.error(`API Error (${status}): ${message}`, error);
  return res.status(status).json({
    success: false,
    message,
    ...(error && { error: error.message || error })
  });
};

/**
 * Validation error response
 * @param {Object} res - Express response object
 * @param {string} message - Validation error message
 * @returns {Object} - Express response
 */
const validationError = (res, message) => {
  return errorResponse(res, message, null, 400);
};

/**
 * Not found error response
 * @param {Object} res - Express response object
 * @param {string} message - Not found error message
 * @returns {Object} - Express response
 */
const notFoundError = (res, message = 'Resource not found') => {
  return errorResponse(res, message, null, 404);
};

/**
 * HTML response
 * @param {Object} res - Express response object
 * @param {string} html - HTML content
 * @param {number} status - HTTP status code
 * @returns {Object} - Express response
 */
const htmlResponse = (res, html, status = 200) => {
  res.setHeader('Content-Type', 'text/html');
  return res.status(status).send(html);
};

module.exports = {
  successResponse,
  errorResponse,
  validationError,
  notFoundError,
  htmlResponse
}; 