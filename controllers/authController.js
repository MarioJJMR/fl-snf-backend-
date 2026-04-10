const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../helpers/db');
const { verifyGoogleToken } = require('../middleware/googleAuth');

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

module.exports = { login, logout, me, loginGoogle };
