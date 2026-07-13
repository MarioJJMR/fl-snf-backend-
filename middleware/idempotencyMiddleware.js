const logger = require('../helpers/logger');
const idempotencyService = require('../services/idempotencyService');

/**
 * Idempotency Middleware
 * Ensures POST, PUT, PATCH requests with idempotency-key headers
 * return the same result when retried
 */

/**
 * Main idempotency middleware
 * Usage: app.use(idempotencyMiddleware);
 */
const idempotencyMiddleware = async (req, res, next) => {
  // Only apply to mutation operations
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  const idempotencyKey = req.headers['idempotency-key'];

  // Require idempotency-key for all mutations
  if (!idempotencyKey) {
    logger.warn(`[Idempotency] Missing idempotency-key for ${req.method} ${req.originalUrl}`);
    return res.status(400).json({
      success: false,
      error: 'idempotency-key header is required for mutations (POST, PUT, PATCH)',
      hint: 'Include a unique idempotency-key header (UUID or similar) to enable idempotency'
    });
  }

  // Validate idempotency key format (should be reasonably unique string)
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 255) {
    return res.status(400).json({
      success: false,
      error: 'Invalid idempotency-key format',
      hint: 'idempotency-key must be a string between 8 and 255 characters'
    });
  }

  try {
    // Check for cached response
    const cached = await idempotencyService.getCachedResponse(idempotencyKey);
    if (cached) {
      // Return cached response
      logger.info(`[Idempotency] Returning cached response for key: ${idempotencyKey}`);
      return res.status(cached.statusCode).json(cached.data);
    }
  } catch (err) {
    logger.error(`[Idempotency] Error checking cache: ${err.message}`);
    // Don't fail the request - continue normally if cache check fails
  }

  // Store original response methods
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  // Intercept json responses to store for idempotency
  res.json = function(body) {
    // Store response for idempotent replay
    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
      // Only cache successful responses (2xx)
      idempotencyService.storeResponse(
        idempotencyKey,
        req.method,
        req.originalUrl,
        res.statusCode,
        body
      ).catch(err => {
        logger.error(`[Idempotency] Failed to store response: ${err.message}`);
      });
    }

    // Add idempotency-key to response headers for client reference
    res.setHeader('idempotency-key', idempotencyKey);
    return originalJson(body);
  };

  // Also intercept send for plain text responses (less common but for completeness)
  res.send = function(body) {
    res.setHeader('idempotency-key', idempotencyKey);
    return originalSend(body);
  };

  // Attach to request for use in handlers if needed
  req.idempotencyKey = idempotencyKey;

  next();
};

/**
 * Optional: Wrap response to ensure tracking
 * Use if you need to track all responses including errors
 */
const idempotencyResponseWrapper = async (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  const idempotencyKey = req.idempotencyKey;
  if (!idempotencyKey) {
    return next();
  }

  // Capture all status codes, including errors
  const originalJson = res.json.bind(res);
  res.json = function(body) {
    idempotencyService.storeResponse(
      idempotencyKey,
      req.method,
      req.originalUrl,
      res.statusCode || 500,
      body
    ).catch(err => {
      logger.error(`[Idempotency] Failed to store response: ${err.message}`);
    });

    return originalJson(body);
  };

  next();
};

/**
 * Initialize idempotency service (setup cleanup job)
 * Call this once on app startup
 */
const initializeIdempotency = () => {
  logger.info('[Idempotency] Initializing idempotency middleware');

  // Run cleanup every 6 hours
  setInterval(async () => {
    await idempotencyService.cleanupExpiredRequests();
  }, 6 * 60 * 60 * 1000);

  // Initial cleanup after 1 minute
  setTimeout(async () => {
    await idempotencyService.cleanupExpiredRequests();
  }, 60 * 1000);
};

module.exports = {
  idempotencyMiddleware,
  idempotencyResponseWrapper,
  initializeIdempotency
};
