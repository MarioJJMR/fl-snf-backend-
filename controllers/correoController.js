const correoService = require('../services/correoService');
const logger = require('../helpers/logger');

const sondeo = async (req, res, next) => {
  try {
    const { nombre, from, obra, mensaje, resumen } = req.body;

    if (!nombre || !from || !obra)
      return res.status(400).json({ success: false, error: 'nombre, from y obra son requeridos' });

    if (!process.env.RESEND_API_KEY)
      return res.status(503).json({ success: false, error: 'Servicio de correo no configurado en el servidor' });

    await correoService.sendSondeo({ nombre, from, obra, mensaje, resumen });
    res.json({ success: true, message: 'Sondeo enviado correctamente' });
  } catch (err) {
    logger.error(`[Correo] sondeo error: ${err.message}`);
    next(err);
  }
};

const soporte = async (req, res, next) => {
  try {
    const { nombre, email, asunto, mensaje, obra } = req.body;

    if (!nombre || !email || !asunto || !mensaje)
      return res.status(400).json({ success: false, error: 'nombre, email, asunto y mensaje son requeridos' });

    if (!process.env.RESEND_API_KEY)
      return res.status(503).json({ success: false, error: 'Servicio de correo no configurado en el servidor' });

    await correoService.sendSoporte({ nombre, email, asunto, mensaje, obra: obra || 'N/D' });
    res.json({ success: true, message: 'Mensaje de soporte enviado correctamente' });
  } catch (err) {
    logger.error(`[Correo] soporte error: ${err.message}`);
    next(err);
  }
};

const notificacion = async (req, res, next) => {
  try {
    const { asunto, mensaje, obras, rol } = req.body;

    if (!asunto || !mensaje || !obras)
      return res.status(400).json({ success: false, error: 'asunto, mensaje y obras son requeridos' });

    const rolFilter = rol && rol !== 'todos' ? rol : null;
    const adminNombre = req.user?.nombre || req.user?.usuario || 'Administración';

    const result = await correoService.sendNotificacionAdmin({
      asunto, mensaje, obras, rolFilter,
      adminId: req.user.id,
      adminNombre
    });

    if (!result)
      return res.status(404).json({ success: false, error: 'No se encontraron usuarios con correo en las obras seleccionadas' });

    res.json({
      success: true,
      data: {
        totalEnviados: result.totalEnviados,
        nombresObras: result.nombresObras,
        ...(!result.correoActivo && { advertencia: 'Servicio de correo no configurado — aviso guardado solo en el sistema' })
      }
    });
  } catch (err) {
    logger.error(`[Correo] notificacion error: ${err.message}`);
    next(err);
  }
};

const getNotificaciones = async (req, res, next) => {
  try {
    const data = await correoService.getHistorial();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

module.exports = { sondeo, soporte, notificacion, getNotificaciones };
