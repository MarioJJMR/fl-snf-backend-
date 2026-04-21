const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../helpers/db');
const { verifyGoogleToken } = require('../middleware/googleAuth');
const { sendMail } = require('../helpers/mailer');

const login = async (req, res) => {
  try {
    const { usuario, contrasena } = req.body;
    if (!usuario || !contrasena)
      return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });

    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE usuario = ? AND activo = 1',
      [usuario]
    );

    if (rows.length === 0)
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });

    const user = rows[0];
    const valid = await bcrypt.compare(contrasena, user.contrasena);
    if (!valid)
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });

    // Fix #2: incluir obra_id en payload
    // Fix #3: incluir jti para poder revocar el token en logout
    const jti = uuidv4();
    const token = jwt.sign(
      { id: user.id, usuario: user.usuario, rol: user.rol, obra_id: user.obra_id || null, jti },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const { contrasena: _, ...userSafe } = user;
    res.json({ success: true, data: { token, user: userSafe }, message: 'Login exitoso' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Fix #3: logout real — inserta el jti en la blacklist
const logout = async (req, res) => {
  try {
    const { jti, exp } = req.user;
    if (jti && exp) {
      await pool.query(
        `INSERT IGNORE INTO sesiones_revocadas (jti, expira_en) VALUES (?, FROM_UNIXTIME(?))`,
        [jti, exp]
      );
    }
    res.json({ success: true, message: 'Sesión cerrada' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const me = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, usuario, rol, nombre, obra_id, activo, fecha_registro FROM usuarios WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const loginGoogle = async (req, res) => {
  try {
    const { id_token } = req.body;
    if (!id_token)
      return res.status(400).json({ success: false, error: 'id_token requerido' });

    let payload;
    try {
      payload = await verifyGoogleToken(id_token);
    } catch {
      return res.status(401).json({ success: false, error: 'Token de Google inválido o expirado' });
    }

    const { email } = payload;

    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE email = ? AND activo = 1',
      [email]
    );

    if (rows.length === 0)
      return res.status(403).json({ success: false, error: 'Usuario no autorizado en el sistema' });

    const user = rows[0];
    const jti = uuidv4();
    const token = jwt.sign(
      { id: user.id, usuario: user.usuario, rol: user.rol, obra_id: user.obra_id || null, jti },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const { contrasena: _, ...userSafe } = user;
    res.json({ success: true, data: { token, user: userSafe }, message: 'Login con Google exitoso' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ success: false, error: 'Email requerido' });

    const [rows] = await pool.query(
      'SELECT id, nombre, usuario FROM usuarios WHERE email = ? AND activo = 1',
      [email]
    );

    // Respuesta genérica siempre para no revelar si el email existe
    if (rows.length === 0)
      return res.json({ success: true, message: 'Si el correo está registrado, recibirás un enlace en breve.' });

    const user = rows[0];
    const token = uuidv4();
    const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await pool.query(
      'INSERT INTO password_reset_tokens (token, user_id, expira_en) VALUES (?, ?, ?)',
      [token, user.id, expira]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'https://fl-snf-frontend-production.up.railway.app';
    const resetLink = `${frontendUrl}/reset-password.html?token=${token}`;

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
            <p style="font-size:15px">Hola <strong>${user.nombre || user.usuario}</strong>,</p>
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

    res.json({ success: true, message: 'Si el correo está registrado, recibirás un enlace en breve.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(400).json({ success: false, error: 'Token y contraseña son requeridos' });
    if (password.length < 6)
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });

    const [rows] = await pool.query(
      'SELECT * FROM password_reset_tokens WHERE token = ? AND usado = 0 AND expira_en > NOW()',
      [token]
    );

    if (rows.length === 0)
      return res.status(400).json({ success: false, error: 'El enlace no es válido o ya expiró. Solicita uno nuevo.' });

    const { user_id } = rows[0];
    const hash = await bcrypt.hash(password, 10);

    await pool.query('UPDATE usuarios SET contrasena = ? WHERE id = ?', [hash, user_id]);
    await pool.query('UPDATE password_reset_tokens SET usado = 1 WHERE token = ?', [token]);

    res.json({ success: true, message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { login, logout, me, loginGoogle, forgotPassword, resetPassword };
