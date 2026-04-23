const nodemailer = require('nodemailer');

console.log('[Mailer] Inicializando transporter:', {
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT) || 587,
  user:   process.env.SMTP_USER || '(no definido)',
  pass:   process.env.SMTP_PASS ? '***configurado***' : '(no definido)'
});

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT) || 465,
  secure: true,
  family: 4,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendMail({ to, cc, subject, html }) {
  console.log('[Mailer] Enviando correo a:', to, '| Asunto:', subject);
  try {
    const info = await transporter.sendMail({
      from: `"Fundación Loyola" <${process.env.SMTP_USER}>`,
      to,
      ...(cc ? { cc } : {}),
      subject,
      html
    });
    console.log('[Mailer] Correo enviado OK. MessageId:', info.messageId);
    return info;
  } catch (err) {
    console.error('[Mailer] Error al enviar correo:', err.message);
    console.error('[Mailer] Código de error:', err.code);
    console.error('[Mailer] Respuesta SMTP:', err.response || '(sin respuesta)');
    throw err;
  }
}

module.exports = { sendMail };
