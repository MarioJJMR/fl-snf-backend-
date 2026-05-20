const authService = require('../services/authService');
const logger = require('../helpers/logger');

const login = async (req, res, next) => {
  try {
    const { usuario, contrasena } = req.body;
    logger.info(`[auth] POST /login — body keys: ${Object.keys(req.body).join(', ')} — usuario="${usuario}"`);

    if (!usuario || !contrasena)
      return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });

    const result = await authService.login(usuario, contrasena);
    if (!result) {
      logger.warn(`[auth] login failed for usuario="${usuario}" — returning 401`);
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    res.json({ success: true, data: result, message: 'Login exitoso' });
  } catch (err) { next(err); }
};

const logout = async (req, res, next) => {
  try {
    await authService.logout(req.user.jti, req.user.exp);
    res.json({ success: true, message: 'Sesión cerrada' });
  } catch (err) { next(err); }
};

const me = async (req, res, next) => {
  try {
    const user = await authService.me(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const loginGoogle = async (req, res, next) => {
  try {
    const { id_token } = req.body;
    if (!id_token)
      return res.status(400).json({ success: false, error: 'id_token requerido' });

    const result = await authService.loginGoogle(id_token);
    if (result === null)
      return res.status(401).json({ success: false, error: 'Token de Google inválido o expirado' });
    if (result === false)
      return res.status(403).json({ success: false, error: 'Usuario no autorizado en el sistema' });

    res.json({ success: true, data: result, message: 'Login con Google exitoso' });
  } catch (err) { next(err); }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ success: false, error: 'Email requerido' });

    await authService.forgotPassword(email);
    res.json({ success: true, message: 'Si el correo está registrado, recibirás un enlace en breve.' });
  } catch (err) { next(err); }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(400).json({ success: false, error: 'Token y contraseña son requeridos' });
    if (password.length < 6)
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });

    const ok = await authService.resetPassword(token, password);
    if (!ok)
      return res.status(400).json({ success: false, error: 'El enlace no es válido o ya expiró. Solicita uno nuevo.' });

    res.json({ success: true, message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' });
  } catch (err) { next(err); }
};

module.exports = { login, logout, me, loginGoogle, forgotPassword, resetPassword };
