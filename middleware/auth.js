const jwt = require('jsonwebtoken');
const pool = require('../helpers/db');

/**
 * Verifica el Bearer JWT y comprueba que no haya sido revocado (logout).
 * Adjunta el payload decodificado a req.user.
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Token de autenticación no proporcionado'
    });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'El token ha expirado' });
    }
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  // Fix #3: verificar que el token no haya sido revocado por logout
  if (decoded.jti) {
    try {
      const [rows] = await pool.query(
        'SELECT 1 FROM sesiones_revocadas WHERE jti = ?',
        [decoded.jti]
      );
      if (rows.length > 0) {
        return res.status(401).json({ success: false, error: 'La sesión ha sido cerrada. Inicia sesión nuevamente.' });
      }
    } catch (_) {
      // Si la tabla no existe aún (primera ejecución antes del seed), dejar pasar
    }
  }

  req.user = decoded;
  next();
}

/**
 * Verifica que el usuario autenticado tenga uno de los roles indicados.
 * Debe usarse después de verifyToken.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ success: false, error: 'No tienes permisos para realizar esta acción' });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole };
