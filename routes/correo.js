const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { sendMail } = require('../helpers/mailer');

// POST /api/correo/sondeo
router.post('/sondeo', verifyToken, async (req, res) => {
  try {
    const { nombre, from, obra, mensaje, resumen } = req.body;

    if (!nombre || !from || !obra) {
      return res.status(400).json({ success: false, error: 'nombre, from y obra son requeridos' });
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(503).json({ success: false, error: 'Servicio de correo no configurado en el servidor' });
    }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
        <div style="background:#1c3050;padding:28px 32px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0;font-size:20px">Sondeo SNF 2025 — Fundación Loyola</h2>
          <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">Enviado desde el Sistema FL-SNF</p>
        </div>
        <div style="background:#fff;padding:28px 32px;border:1px solid #e0e8f4;border-top:none">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px 0;color:#4a5568;width:160px"><strong>Obra</strong></td><td style="padding:8px 0">${obra}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568"><strong>Remitente</strong></td><td style="padding:8px 0">${nombre}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568"><strong>Correo</strong></td><td style="padding:8px 0">${from}</td></tr>
            <tr><td style="padding:8px 0;color:#4a5568"><strong>Fecha</strong></td><td style="padding:8px 0">${new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })}</td></tr>
          </table>

          ${mensaje ? `
          <div style="margin-top:20px;padding:16px;background:#f4f6f9;border-radius:6px;border-left:4px solid #b8963a">
            <strong style="font-size:13px;color:#4a5568">Mensaje adicional:</strong>
            <p style="margin:8px 0 0;font-size:14px">${mensaje}</p>
          </div>` : ''}

          ${resumen ? `
          <div style="margin-top:24px">
            <strong style="font-size:13px;color:#4a5568;text-transform:uppercase;letter-spacing:0.5px">Resumen del Sondeo</strong>
            <pre style="margin-top:10px;background:#f4f6f9;padding:16px;border-radius:6px;font-size:12px;white-space:pre-wrap;border:1px solid #e0e8f4">${resumen}</pre>
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
      subject: `Sondeo SNF 2025 — ${obra}`,
      html
    });

    res.json({ success: true, message: 'Sondeo enviado correctamente' });
  } catch (err) {
    console.error('[Correo] Error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Error al enviar el correo.',
      detail: err.message,
      code: err.code || null,
      smtp: err.response || null
    });
  }
});

module.exports = router;
