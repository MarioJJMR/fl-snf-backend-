const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendMail({ to, cc, subject, html }) {
  return transporter.sendMail({
    from: `"Fundación Loyola" <${process.env.SMTP_USER}>`,
    to,
    ...(cc ? { cc } : {}),
    subject,
    html
  });
}

module.exports = { sendMail };
