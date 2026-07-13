const crypto = require('crypto');
const pool = require('../helpers/db');
const logger = require('../helpers/logger');

const SKIP_METHODS = ['GET', 'HEAD', 'OPTIONS'];
const MAX_KEY_LENGTH = 255;

const getEnvInt = (envVar, fallback) => {
  const parsed = parseInt(process.env[envVar], 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const TTL_MS = getEnvInt('IDEMPOTENCY_TTL_MS', 24 * 60 * 60 * 1000);
const PENDING_TIMEOUT_MS = getEnvInt('IDEMPOTENCY_PENDING_TIMEOUT_MS', 60 * 1000);

function hookResponseCapture(req, res, key) {
  const originalJson = res.json.bind(res);
  let capturedBody;
  res.json = (body) => {
    capturedBody = body;
    return originalJson(body);
  };

  res.on('finish', async () => {
    try {
      await pool.query(
        `UPDATE idempotency_keys
         SET status = 'completed', response_status = ?, response_body = ?, user_id = ?
         WHERE idempotency_key = ?`,
        [res.statusCode, JSON.stringify(capturedBody ?? null), req.user?.id || null, key]
      );
    } catch (err) {
      logger.error(`[idempotency] error al guardar la respuesta: ${err.message}`);
    }
  });
}

function computeRequestHash(req) {
  const contentType = req.headers['content-type'] || '';
  const isMultipart = contentType.startsWith('multipart/form-data');
  // El body de multipart aún no está parseado en este punto de la cadena
  // (multer corre después, a nivel de ruta), así que solo se huellea
  // método + ruta + content-type para esos casos.
  const base = isMultipart
    ? `${req.method}:${req.originalUrl}:${contentType}`
    : `${req.method}:${req.originalUrl}:${JSON.stringify(req.body || {})}`;
  return crypto.createHash('sha256').update(base).digest('hex');
}

/**
 * Soporte de Idempotency-Key (estilo Stripe): si el cliente envía el header
 * 'Idempotency-Key', se guarda la respuesta y se reproduce ante reintentos.
 * Si el header no está presente, la solicitud pasa sin ningún efecto.
 */
async function idempotency(req, res, next) {
  if (SKIP_METHODS.includes(req.method)) return next();

  const key = req.headers['idempotency-key'];
  if (!key) return next();

  if (typeof key !== 'string' || key.length > MAX_KEY_LENGTH) {
    return res.status(400).json({ success: false, error: 'Idempotency-Key inválida' });
  }

  const requestHash = computeRequestHash(req);
  const expiresAt = new Date(Date.now() + TTL_MS);

  let claimed = false;
  try {
    await pool.query(
      `INSERT INTO idempotency_keys (idempotency_key, request_hash, method, path, status, expires_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [key, requestHash, req.method, req.originalUrl, expiresAt]
    );
    claimed = true;
  } catch (err) {
    if (err.errno === 1146) {
      logger.warn('[idempotency] tabla idempotency_keys no existe, dejando pasar la solicitud');
      return next();
    }
    if (err.errno !== 1062) {
      logger.error(`[idempotency] error al reclamar la clave: ${err.message}`);
      return next();
    }
    // errno 1062 (ER_DUP_ENTRY): la clave ya existe, se maneja abajo
  }

  if (claimed) {
    hookResponseCapture(req, res, key);
    return next();
  }

  // Clave duplicada: revisar el estado del registro existente
  let rows;
  try {
    [rows] = await pool.query('SELECT * FROM idempotency_keys WHERE idempotency_key = ?', [key]);
  } catch (err) {
    logger.error(`[idempotency] error al leer la clave: ${err.message}`);
    return next();
  }

  const existing = rows[0];
  if (!existing) return next(); // el registro desapareció (barrido de limpieza concurrente)

  if (existing.request_hash !== requestHash) {
    return res.status(409).json({
      success: false,
      error: 'Esta Idempotency-Key ya fue usada con una solicitud diferente (método, ruta o cuerpo distintos).'
    });
  }

  if (existing.status === 'completed') {
    return res.status(existing.response_status || 200).json(existing.response_body);
  }

  // status === 'pending': ¿es un duplicado concurrente real o una solicitud
  // previa que se cayó a mitad de camino (nunca llegó a 'completed')?
  const ageMs = Date.now() - new Date(existing.created_at).getTime();
  if (ageMs < PENDING_TIMEOUT_MS) {
    return res.status(409).json({ success: false, error: 'Esta operación ya está en curso. Intenta de nuevo en un momento.' });
  }

  // Reclamo optimista: solo gana quien actualice la fila condicionada al created_at leído
  let reclaimResult;
  try {
    [reclaimResult] = await pool.query(
      `UPDATE idempotency_keys
       SET status = 'pending', request_hash = ?, method = ?, path = ?, expires_at = ?, created_at = CURRENT_TIMESTAMP
       WHERE idempotency_key = ? AND status = 'pending' AND created_at = ?`,
      [requestHash, req.method, req.originalUrl, expiresAt, key, existing.created_at]
    );
  } catch (err) {
    logger.error(`[idempotency] error al reclamar clave expirada: ${err.message}`);
    return next();
  }

  if (reclaimResult.affectedRows !== 1) {
    return res.status(409).json({ success: false, error: 'Esta operación ya está en curso. Intenta de nuevo en un momento.' });
  }

  hookResponseCapture(req, res, key);
  return next();
}

module.exports = idempotency;
