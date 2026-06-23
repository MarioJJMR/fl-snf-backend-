const pool = require('../helpers/db');

async function getByObra(obraId) {
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
  return rows.map(r => ({ ...r, leida: r.leida > 0 }));
}

async function marcarLeidas(obraId) {
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

  return { marcadas: notifs.length };
}

module.exports = { getByObra, marcarLeidas };
