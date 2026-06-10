const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const correoService = require('../services/correoService');
const pool = require('../helpers/db');

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

// POST /api/correo/notificacion  (admin only)
router.post('/notificacion', verifyToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { asunto, mensaje, obras, rol } = req.body;
    if (!asunto || !mensaje || !obras)
      return res.status(400).json({ success: false, error: 'asunto, mensaje y obras son requeridos' });

    if (!process.env.RESEND_API_KEY)
      return res.status(503).json({ success: false, error: 'Servicio de correo no configurado' });

    // Filtro de rol: 'todos' | 'usuario' | 'admin'
    const rolFilter = rol && rol !== 'todos' ? rol : null;

    // Obtener usuarios destinatarios
    let usuariosQuery;
    if (obras === 'todas' || (Array.isArray(obras) && obras.includes('todas'))) {
      const rolClause = rolFilter ? ' AND u.rol = ?' : '';
      [usuariosQuery] = await pool.query(
        `SELECT u.email, u.nombre, o.nombre_obra
         FROM usuarios u JOIN obras o ON u.obra_id = o.id
         WHERE u.email IS NOT NULL AND u.activo = 1${rolClause}`,
        rolFilter ? [rolFilter] : []
      );
    } else {
      const ids = Array.isArray(obras) ? obras : [obras];
      const rolClause = rolFilter ? ' AND u.rol = ?' : '';
      [usuariosQuery] = await pool.query(
        `SELECT u.email, u.nombre, o.nombre_obra
         FROM usuarios u JOIN obras o ON u.obra_id = o.id
         WHERE u.obra_id IN (?) AND u.email IS NOT NULL AND u.activo = 1${rolClause}`,
        rolFilter ? [ids, rolFilter] : [ids]
      );
    }

    if (!usuariosQuery.length)
      return res.status(404).json({ success: false, error: 'No se encontraron usuarios con correo en las obras seleccionadas' });

    const adminNombre = req.user?.nombre || req.user?.usuario || 'Administración';
    const nombresObras = [...new Set(usuariosQuery.map(u => u.nombre_obra))];
    let totalEnviados = 0;

    for (const u of usuariosQuery) {
      try {
        await correoService.sendNotificacion({
          asunto, mensaje,
          obraNombre: u.nombre_obra,
          destinatarioEmail: u.email,
          adminNombre
        });
        totalEnviados++;
      } catch { /* continuar con los demás */ }
    }

    // Guardar en historial
    const destinatariosJSON = obras === 'todas' ? ['todas'] : (Array.isArray(obras) ? obras : [obras]);
    await pool.query(
      `INSERT INTO notificaciones (asunto, mensaje, destinatarios, nombres_obras, enviado_por, total_enviados)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [asunto, mensaje, JSON.stringify(destinatariosJSON), JSON.stringify(nombresObras), req.user.id, totalEnviados]
    );

    res.json({ success: true, data: { totalEnviados, nombresObras } });
  } catch (err) {
    next(err);
  }
});

// GET /api/correo/notificaciones  (admin only)
router.get('/notificaciones', verifyToken, requireRole('admin'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT n.id, n.asunto, n.mensaje, n.destinatarios, n.nombres_obras,
              n.total_enviados, n.fecha_envio, u.usuario AS enviado_por
       FROM notificaciones n
       LEFT JOIN usuarios u ON n.enviado_por = u.id
       ORDER BY n.fecha_envio DESC
       LIMIT 100`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
