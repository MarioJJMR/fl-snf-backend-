const notificacionesService = require('../services/notificacionesService');

const getByObra = async (req, res, next) => {
  try {
    const data = await notificacionesService.getByObra(req.params.obraId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const marcarLeidas = async (req, res, next) => {
  try {
    const data = await notificacionesService.marcarLeidas(req.params.obraId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

module.exports = { getByObra, marcarLeidas };
