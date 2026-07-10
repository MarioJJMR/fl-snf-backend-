const idempotencyService = require('../services/idempotencyService');

/**
 * Utility helper for controllers to work with idempotency
 * Provides convenience methods for common idempotency patterns
 */

/**
 * Get the current version of an entity for optimistic locking
 * @param {string} entityType - Type of entity (e.g., 'usuarios', 'proyectos')
 * @param {string} entityId - ID of the entity
 * @returns {Promise<number>} - Current version number
 */
async function getVersion(entityType, entityId) {
  return await idempotencyService.getEntityVersion(entityType, entityId);
}

/**
 * Increment entity version after updates
 * @param {string} entityType - Type of entity (e.g., 'usuarios', 'proyectos')
 * @param {string} entityId - ID of the entity
 * @returns {Promise<number>} - New version number
 */
async function incrementVersion(entityType, entityId) {
  return await idempotencyService.incrementEntityVersion(entityType, entityId);
}

/**
 * Attach version info to response data
 * @param {object} data - Response object
 * @param {string} entityType - Type of entity
 * @param {string} entityId - ID of the entity
 * @returns {Promise<object>} - Enhanced response with version
 */
async function withVersion(data, entityType, entityId) {
  const version = await getVersion(entityType, entityId);
  return {
    ...data,
    _version: version
  };
}

/**
 * Build response with idempotency info
 * @param {boolean} success - Was operation successful
 * @param {object} data - Response data
 * @param {string} message - Response message
 * @param {object} extra - Extra fields to add to response
 * @returns {object} - Formatted response
 */
function buildResponse(success, data, message = '', extra = {}) {
  const response = {
    success,
    ...(data && { data }),
    ...(message && { message }),
    ...extra
  };
  return response;
}

/**
 * Send success response with proper status code
 * @param {object} res - Express response object
 * @param {object} data - Response data
 * @param {string} message - Response message
 * @param {number} statusCode - HTTP status code (default: 200 for updates, 201 for creates)
 * @param {object} extra - Extra fields
 */
function sendSuccess(res, data, message = '', statusCode = 200, extra = {}) {
  const response = buildResponse(true, data, message, extra);
  return res.status(statusCode).json(response);
}

/**
 * Send error response with proper status code
 * @param {object} res - Express response object
 * @param {string} error - Error message
 * @param {number} statusCode - HTTP status code (default: 400)
 * @param {object} extra - Extra fields (e.g., hint, data)
 */
function sendError(res, error, statusCode = 400, extra = {}) {
  const response = buildResponse(false, null, error, extra);
  return res.status(statusCode).json(response);
}

/**
 * Handle conflict error (409 - resource was modified)
 * @param {object} res - Express response object
 * @param {object} currentData - Current state of the resource
 * @param {string} message - Optional custom message
 */
function sendConflict(res, currentData, message = 'Resource was modified. Please refresh and retry.') {
  return res.status(409).json({
    success: false,
    error: message,
    data: currentData
  });
}

/**
 * Check if client version matches current version (optimistic locking)
 * @param {object} req - Express request object
 * @param {string} entityType - Type of entity
 * @param {string} entityId - ID of the entity
 * @returns {Promise<boolean>} - True if versions match
 */
async function versionMatches(req, entityType, entityId) {
  const clientVersion = parseInt(req.body._version || req.body.version || 0, 10);
  const serverVersion = await getVersion(entityType, entityId);
  return clientVersion === serverVersion;
}

module.exports = {
  getVersion,
  incrementVersion,
  withVersion,
  buildResponse,
  sendSuccess,
  sendError,
  sendConflict,
  versionMatches
};
