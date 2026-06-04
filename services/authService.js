const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../helpers/db');
const { verifyGoogleToken } = require('../middleware/googleAuth');
const { sendMail } = require('../helpers/mailer');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function signToken(user) {
  const jti = uuidv4();
  const token = jwt.sign(
    { id: user.id, usuario: user.usuario, rol: user.rol, obra_id: user.obra_id || null, jti },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
  return { token, jti };
}

async function findActiveUserByEmail(email) {
  const [rows] = await pool.query(
    'SELECT id, usuario, email, rol, nombre, obra_id, activo, contrasena FROM usuarios WHERE email = ? AND activo = 1',
    [email]
  );
  return rows[0] || null;
}

async function login(email, contrasena) {
  const logger = require('../helpers/logger');
  logger.info(`[auth] login attempt for email: "${email}"`);

  let user;
  try {
    user = await findActiveUserByEmail(email);
  } catch (err) {
    logger.error(`[auth] DB error in findActiveUserByEmail: ${err.message}`);
    throw err;
  }

  if (!user) {
    // Extra debug: check if user exists at all (wrong email or inactive)
    try {
      const [rows] = await pool.query(
        'SELECT id, usuario, email, activo FROM usuarios WHERE email = ?',
        [email]
      );
      if (rows.length === 0) {
        logger.warn(`[auth] no user found with email="${email}"`);
      } else {
        logger.warn(`[auth] user found but activo=${rows[0].activo} for email="${email}"`);
      }
    } catch (err) {
      logger.error(`[auth] DB error checking user existence: ${err.message}`);
    }
    return null;
  }

  logger.info(`[auth] user found: id=${user.id} usuario=${user.usuario} activo=${user.activo}`);

  const valid = await bcrypt.compare(contrasena, user.contrasena);
  if (!valid) {
    logger.warn(`[auth] password mismatch for email="${email}"`);
    return null;
  }

  const { token } = signToken(user);
  logger.info(`[auth] login success for email="${email}"`);
  const { contrasena: _, ...userSafe } = user;
  return { token, user: userSafe };
}

async function logout(jti, exp) {
  if (jti && exp) {
    await pool.query(
      `INSERT IGNORE INTO sesiones_revocadas (jti, expira_en) VALUES (?, FROM_UNIXTIME(?))`,
      [jti, exp]
    );
  }
}

async function me(userId) {
  const [rows] = await pool.query(
    'SELECT id, usuario, rol, nombre, obra_id, activo, fecha_registro FROM usuarios WHERE id = ?',
    [userId]
  );
  return rows[0] || null;
}

async function loginGoogle(idToken) {
  let payload;
  try {
    payload = await verifyGoogleToken(idToken);
  } catch {
    return null;
  }

  const user = await findActiveUserByEmail(payload.email);
  if (!user) return false; // email no autorizado

  const { token } = signToken(user);
  const { contrasena: _, ...userSafe } = user;
  return { token, user: userSafe };
}

async function forgotPassword(email) {
  const [rows] = await pool.query(
    'SELECT id, nombre, usuario FROM usuarios WHERE email = ? AND activo = 1',
    [email]
  );
  if (rows.length === 0) return; // respuesta genérica, no revelar si existe

  const user = rows[0];
  const token = uuidv4();
  const expira = new Date(Date.now() + 60 * 60 * 1000);

  await pool.query('UPDATE password_reset_tokens SET usado = 1 WHERE user_id = ? AND usado = 0', [user.id]);
  await pool.query(
    'INSERT INTO password_reset_tokens (token, user_id, expira_en) VALUES (?, ?, ?)',
    [token, user.id, expira]
  );

  const frontendUrl = process.env.FRONTEND_URL || 'https://fl-snf-frontend-production.up.railway.app';
  const resetLink = `${frontendUrl}/reset-password.html?token=${token}`;
  const displayName = escapeHtml(user.nombre || user.usuario);

  await sendMail({
    to: email,
    subject: 'Restablecer contraseña — Sistema FL-SNF',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827">
        <div style="background:#1c3050;padding:28px 32px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0;font-size:20px">Restablecer Contraseña</h2>
          <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">Sistema FL-SNF · Fundación Loyola</p>
        </div>
        <div style="background:#fff;padding:28px 32px;border:1px solid #e0e8f4;border-top:none">
          <p style="font-size:15px">Hola <strong>${displayName}</strong>,</p>
          <p style="font-size:14px;color:#4a5568">Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón de abajo para continuar.</p>
          <div style="text-align:center;margin:28px 0">
            <a href="${resetLink}"
               style="background:#1c3050;color:#fff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block">
              Restablecer Contraseña
            </a>
          </div>
          <p style="font-size:12px;color:#8a96a8">Este enlace es válido por <strong>1 hora</strong>. Si no solicitaste este cambio, ignora este correo — tu contraseña no será modificada.</p>
          <hr style="border:none;border-top:1px solid #e0e8f4;margin:20px 0">
          <p style="font-size:12px;color:#8a96a8">O copia y pega este enlace en tu navegador:<br>
            <a href="${resetLink}" style="color:#2a4a78;word-break:break-all">${resetLink}</a>
          </p>
        </div>
        <div style="background:#f4f6f9;padding:14px 32px;border-radius:0 0 8px 8px;border:1px solid #e0e8f4;border-top:none;font-size:11px;color:#8a96a8;text-align:center">
          Sistema FL-SNF · Fundación Loyola · ${new Date().getFullYear()}
        </div>
      </div>
    `
  });
}

async function resetPassword(token, password) {
  const [rows] = await pool.query(
    'SELECT * FROM password_reset_tokens WHERE token = ? AND usado = 0 AND expira_en > NOW()',
    [token]
  );
  if (rows.length === 0) return false;

  const { user_id } = rows[0];
  const hash = await bcrypt.hash(password, 10);

  await pool.query('UPDATE usuarios SET contrasena = ? WHERE id = ?', [hash, user_id]);
  await pool.query('UPDATE password_reset_tokens SET usado = 1 WHERE token = ?', [token]);

  return true;
}

module.exports = { login, logout, me, loginGoogle, forgotPassword, resetPassword };
