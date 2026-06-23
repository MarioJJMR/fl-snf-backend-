const pool = require('../helpers/db');
const { sendMail } = require('../helpers/mailer');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendSondeo({ nombre, from, obra, mensaje, resumen }) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
      <div style="background:#1c3050;padding:28px 32px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0;font-size:20px">Sondeo SNF 2025 — Fundación Loyola</h2>
        <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">Enviado desde el Sistema FL-SNF</p>
      </div>
      <div style="background:#fff;padding:28px 32px;border:1px solid #e0e8f4;border-top:none">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#4a5568;width:160px"><strong>Obra</strong></td><td style="padding:8px 0">${escapeHtml(obra)}</td></tr>
          <tr><td style="padding:8px 0;color:#4a5568"><strong>Remitente</strong></td><td style="padding:8px 0">${escapeHtml(nombre)}</td></tr>
          <tr><td style="padding:8px 0;color:#4a5568"><strong>Correo</strong></td><td style="padding:8px 0">${escapeHtml(from)}</td></tr>
          <tr><td style="padding:8px 0;color:#4a5568"><strong>Fecha</strong></td><td style="padding:8px 0">${new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })}</td></tr>
        </table>

        ${mensaje ? `
        <div style="margin-top:20px;padding:16px;background:#f4f6f9;border-radius:6px;border-left:4px solid #b8963a">
          <strong style="font-size:13px;color:#4a5568">Mensaje adicional:</strong>
          <p style="margin:8px 0 0;font-size:14px">${escapeHtml(mensaje)}</p>
        </div>` : ''}

        ${resumen ? `
        <div style="margin-top:24px">
          <strong style="font-size:13px;color:#4a5568;text-transform:uppercase;letter-spacing:0.5px">Resumen del Sondeo</strong>
          <pre style="margin-top:10px;background:#f4f6f9;padding:16px;border-radius:6px;font-size:12px;white-space:pre-wrap;border:1px solid #e0e8f4">${escapeHtml(resumen)}</pre>
        </div>` : ''}
      </div>
      <div style="background:#f4f6f9;padding:14px 32px;border-radius:0 0 8px 8px;border:1px solid #e0e8f4;border-top:none;font-size:11px;color:#8a96a8;text-align:center">
        Sistema FL-SNF · Fundación Loyola · ${new Date().getFullYear()}
      </div>
    </div>
  `;

  await sendMail({
    to:      'vinculacion@fundacionloyola.mx',
    cc:      'soporteaobras@fundacionloyola.mx',
    subject: `Sondeo SNF 2025 — ${escapeHtml(obra)}`,
    html
  });
}

async function sendSoporte({ nombre, email, asunto, mensaje, obra }) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
      <div style="background:#7a4e1a;padding:28px 32px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0;font-size:20px">🛟 Solicitud de Soporte — FL-SNF</h2>
        <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">Enviado desde el Sistema FL-SNF</p>
      </div>
      <div style="background:#fff;padding:28px 32px;border:1px solid #e0e8f4;border-top:none">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#4a5568;width:160px"><strong>Obra</strong></td><td style="padding:8px 0">${escapeHtml(obra)}</td></tr>
          <tr><td style="padding:8px 0;color:#4a5568"><strong>Remitente</strong></td><td style="padding:8px 0">${escapeHtml(nombre)}</td></tr>
          <tr><td style="padding:8px 0;color:#4a5568"><strong>Correo</strong></td><td style="padding:8px 0">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:8px 0;color:#4a5568"><strong>Asunto</strong></td><td style="padding:8px 0">${escapeHtml(asunto)}</td></tr>
          <tr><td style="padding:8px 0;color:#4a5568"><strong>Fecha</strong></td><td style="padding:8px 0">${new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })}</td></tr>
        </table>
        <div style="margin-top:20px;padding:16px;background:#fdf6ee;border-radius:6px;border-left:4px solid #c47a2a">
          <strong style="font-size:13px;color:#4a5568">Mensaje:</strong>
          <p style="margin:8px 0 0;font-size:14px;white-space:pre-wrap">${escapeHtml(mensaje)}</p>
        </div>
      </div>
      <div style="background:#f4f6f9;padding:14px 32px;border-radius:0 0 8px 8px;border:1px solid #e0e8f4;border-top:none;font-size:11px;color:#8a96a8;text-align:center">
        Sistema FL-SNF · Fundación Loyola · ${new Date().getFullYear()}
      </div>
    </div>
  `;

  await sendMail({
    to:      'soporteaobras@fundacionloyola.mx',
    subject: `[Soporte] ${escapeHtml(asunto)} — ${escapeHtml(obra)}`,
    html
  });
}

async function sendNotificacion({ asunto, mensaje, obraNombre, destinatarioEmail, adminNombre }) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
      <div style="background:#0d6835;padding:28px 32px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0;font-size:20px">📢 Aviso — Fundación Loyola</h2>
        <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">Sistema FL-SNF 2025</p>
      </div>
      <div style="background:#fff;padding:28px 32px;border:1px solid #d4e8da;border-top:none">
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
          <tr><td style="padding:6px 0;color:#4a5568;width:120px"><strong>Para</strong></td><td style="padding:6px 0">${escapeHtml(obraNombre)}</td></tr>
          <tr><td style="padding:6px 0;color:#4a5568"><strong>Asunto</strong></td><td style="padding:6px 0;font-weight:700">${escapeHtml(asunto)}</td></tr>
          <tr><td style="padding:6px 0;color:#4a5568"><strong>De parte de</strong></td><td style="padding:6px 0">${escapeHtml(adminNombre || 'Administración FL-SNF')}</td></tr>
          <tr><td style="padding:6px 0;color:#4a5568"><strong>Fecha</strong></td><td style="padding:6px 0">${new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })}</td></tr>
        </table>
        <div style="padding:20px;background:#f0f9f4;border-radius:8px;border-left:4px solid #0d6835">
          <p style="margin:0;font-size:15px;line-height:1.7;white-space:pre-wrap">${escapeHtml(mensaje)}</p>
        </div>
      </div>
      <div style="background:#f4f6f9;padding:14px 32px;border-radius:0 0 8px 8px;border:1px solid #d4e8da;border-top:none;font-size:11px;color:#8a96a8;text-align:center">
        Sistema FL-SNF · Fundación Loyola · ${new Date().getFullYear()}
      </div>
    </div>
  `;
  await sendMail({ to: destinatarioEmail, subject: `[FL-SNF] ${escapeHtml(asunto)}`, html });
}

async function sendNotificacionAdmin({ asunto, mensaje, obras, rolFilter, adminId, adminNombre }) {
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

  if (!usuariosQuery.length) return null;

  const nombresObras = [...new Set(usuariosQuery.map(u => u.nombre_obra))];
  const correoActivo = !!process.env.RESEND_API_KEY;
  let totalEnviados = 0;

  if (correoActivo) {
    for (const u of usuariosQuery) {
      try {
        await sendNotificacion({
          asunto, mensaje,
          obraNombre: u.nombre_obra,
          destinatarioEmail: u.email,
          adminNombre
        });
        totalEnviados++;
      } catch { /* continuar con los demás */ }
    }
  }

  const destinatariosJSON = obras === 'todas' ? ['todas'] : (Array.isArray(obras) ? obras : [obras]);
  await pool.query(
    `INSERT INTO notificaciones (asunto, mensaje, destinatarios, nombres_obras, enviado_por, total_enviados)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [asunto, mensaje, JSON.stringify(destinatariosJSON), JSON.stringify(nombresObras), adminId, totalEnviados]
  );

  return { totalEnviados, nombresObras, correoActivo };
}

async function getHistorial() {
  const [rows] = await pool.query(
    `SELECT n.id, n.asunto, n.mensaje, n.destinatarios, n.nombres_obras,
            n.total_enviados, n.fecha_envio, u.usuario AS enviado_por
     FROM notificaciones n
     LEFT JOIN usuarios u ON n.enviado_por = u.id
     ORDER BY n.fecha_envio DESC
     LIMIT 100`
  );
  return rows;
}

module.exports = { sendSondeo, sendSoporte, sendNotificacion, sendNotificacionAdmin, getHistorial };
