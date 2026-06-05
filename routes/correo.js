const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const correoService = require('../services/correoService');

// POST /api/correo/sondeo
router.post('/sondeo', verifyToken, async (req, res, next) => {
  try {
    const { nombre, from, obra, mensaje, resumen } = req.body;

    if (!nombre || !from || !obra)
      return res.status(400).json({ success: false, error: 'nombre, from y obra son requeridos' });

    if (!process.env.RESEND_API_KEY)
      return res.status(503).json({ success: false, error: 'Servicio de correo no configurado en el servidor' });

    await correoService.sendSondeo({ nombre, from, obra, mensaje, resumen });
    res.json({ success: true, message: 'Sondeo enviado correctamente' });
  } catch (err) {
    console.error('[Correo] Error:', err.message);
    next(err);
  }
});

// POST /api/correo/soporte
router.post('/soporte', verifyToken, async (req, res, next) => {
  try {
    const { nombre, email, asunto, mensaje, obra } = req.body;

    if (!nombre || !email || !asunto || !mensaje)
      return res.status(400).json({ success: false, error: 'nombre, email, asunto y mensaje son requeridos' });

    if (!process.env.RESEND_API_KEY)
      return res.status(503).json({ success: false, error: 'Servicio de correo no configurado en el servidor' });

    await correoService.sendSoporte({ nombre, email, asunto, mensaje, obra: obra || 'N/D' });
    res.json({ success: true, message: 'Mensaje de soporte enviado correctamente' });
  } catch (err) {
    console.error('[Correo/Soporte] Error:', err.message);
    next(err);
  }
});

module.exports = router;
