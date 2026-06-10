const express = require('express');
const router = express.Router();
const { verifyToken, requireObraAccess } = require('../middleware/auth');
const pool = require('../helpers/db');

// GET /api/notificaciones/obra/:obraId
// Devuelve las notificaciones dirigidas a esa obra (o a todas), con flag `leida`
router.get('/obra/:obraId', verifyToken, requireObraAccess(), async (req, res, next) => {
  try {
    const { obraId } = req.params;
    const [rows] = await pool.query(
      `SELECT n.id, n.asunto, n.mensaje, n.fecha_envio,
              (SELECT COUNT(*) FROM notificaciones_vistas nv
               WHERE nv.notif_id = n.id AND nv.obra_id = ?) AS leida
       FROM notificaciones n
       WHERE JSON_CONTAINS(n.destinatarios, '"todas"')
          OR JSON_CONTAINS(n.destinatarios, ?)
       ORDER BY n.fecha_envio DESC
       LIMIT 50`,
      [obraId, JSON.stringify(obraId)]
    );
    res.json({
      success: true,
      data: rows.map(r => ({ ...r, leida: r.leida > 0 }))
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/notificaciones/obra/:obraId/leer
// Marca todas las notificaciones no leidas de esa obra como leidas
router.post('/obra/:obraId/leer', verifyToken, requireObraAccess(), async (req, res, next) => {
  try {
    const { obraId } = req.params;
    const [notifs] = await pool.query(
      `SELECT n.id FROM notificaciones n
       WHERE (JSON_CONTAINS(n.destinatarios, '"todas"') OR JSON_CONTAINS(n.destinatarios, ?))
         AND n.id NOT IN (
           SELECT notif_id FROM notificaciones_vistas WHERE obra_id = ?
         )`,
      [JSON.stringify(obraId), obraId]
    );
    if (notifs.length) {
      const vals = notifs.map(n => [n.id, obraId]);
      await pool.query(
        'INSERT IGNORE INTO notificaciones_vistas (notif_id, obra_id) VALUES ?',
        [vals]
      );
    }
    res.json({ success: true, data: { marcadas: notifs.length } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
