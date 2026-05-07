const { Resend } = require('resend');
const logger = require('./logger');

let resend = null;
function getResend() {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

async function sendMail({ to, cc, subject, html }) {
  logger.info(`[Mailer] Enviando correo a: ${to} | Asunto: ${subject}`);
  try {
    const { data, error } = await getResend().emails.send({
      from: process.env.RESEND_FROM || 'Fundación Loyola <onboarding@resend.dev>',
      to,
      ...(cc ? { cc } : {}),
      subject,
      html
    });
    if (error) throw error;
    logger.info(`[Mailer] Correo enviado OK. Id: ${data.id}`);
    return data;
  } catch (err) {
    logger.error(`[Mailer] Error al enviar correo: ${err.message}`);
    throw err;
  }
}

module.exports = { sendMail };
