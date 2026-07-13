const pool = require('../helpers/db');
const logger = require('../helpers/logger');

/**
 * Service for handling idempotency request tracking
 * Prevents duplicate processing of retried requests
 */

/**
 * Retrieve a cached response by idempotency key
 */
async function getCachedResponse(idempotencyKey) {
  try {
    const [rows] = await pool.query(
      `SELECT status_code, response_data FROM idempotency_requests 
       WHERE idempotency_key = ? AND expires_at > NOW()`,
      [idempotencyKey]
    );
    
    if (rows.length > 0) {
      logger.info(`[Idempotency] Cache HIT for key: ${idempotencyKey}`);
      return {
        statusCode: rows[0].status_code,
        data: JSON.parse(rows[0].response_data)
      };
    }
    
    logger.debug(`[Idempotency] Cache MISS for key: ${idempotencyKey}`);
    return null;
  } catch (err) {
    logger.error(`[Idempotency] Error retrieving cached response: ${err.message}`, { stack: err.stack });
    return null;
  }
}

/**
 * Store a response for future idempotent requests
 */
async function storeResponse(idempotencyKey, method, endpoint, statusCode, responseData) {
  try {
    await pool.query(
      `INSERT INTO idempotency_requests 
       (idempotency_key, method, endpoint, status_code, response_data) 
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status_code = VALUES(status_code),
         response_data = VALUES(response_data),
         created_at = NOW(),
         expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR)`,
      [
        idempotencyKey,
        method,
        endpoint,
        statusCode,
        JSON.stringify(responseData)
      ]
    );
    
    logger.debug(`[Idempotency] Stored response for key: ${idempotencyKey}`);
  } catch (err) {
    logger.error(`[Idempotency] Error storing idempotency response: ${err.message}`, { stack: err.stack });
    // Don't throw - idempotency storage failure shouldn't break the request
  }
}

/**
 * Clean up expired idempotency records (runs periodically)
 */
async function cleanupExpiredRequests() {
  try {
    const [result] = await pool.query(
      `DELETE FROM idempotency_requests WHERE expires_at <= NOW()`
    );
    
    if (result.affectedRows > 0) {
      logger.info(`[Idempotency] Cleaned up ${result.affectedRows} expired records`);
    }
  } catch (err) {
    logger.error(`[Idempotency] Error cleaning up expired records: ${err.message}`, { stack: err.stack });
  }
}

/**
 * Get version for optimistic locking
 */
async function getEntityVersion(entityType, entityId) {
  try {
    const [rows] = await pool.query(
      `SELECT version FROM version_tracking WHERE entity_type = ? AND entity_id = ?`,
      [entityType, entityId]
    );
    
    return rows.length > 0 ? rows[0].version : 0;
  } catch (err) {
    logger.error(`[Version] Error getting version: ${err.message}`, { stack: err.stack });
    return 0;
  }
}

/**
 * Increment version for an entity
 */
async function incrementEntityVersion(entityType, entityId) {
  try {
    await pool.query(
      `INSERT INTO version_tracking (entity_type, entity_id, version) 
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE
         version = version + 1,
         updated_at = NOW()`,
      [entityType, entityId]
    );
    
    const [rows] = await pool.query(
      `SELECT version FROM version_tracking WHERE entity_type = ? AND entity_id = ?`,
      [entityType, entityId]
    );
    
    return rows[0]?.version || 1;
  } catch (err) {
    logger.error(`[Version] Error incrementing version: ${err.message}`, { stack: err.stack });
    throw err;
  }
}

module.exports = {
  getCachedResponse,
  storeResponse,
  cleanupExpiredRequests,
  getEntityVersion,
  incrementEntityVersion
};
