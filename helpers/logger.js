const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

const { combine, timestamp, printf, colorize, errors } = format;

const lineFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}] ${stack || message}`;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    lineFormat
  ),
  transports: [
    new transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error'
    }),
    new transports.File({
      filename: path.join(logsDir, 'app.log')
    })
  ]
});

// Always log to console so Railway captures output in production
logger.add(new transports.Console({
  format: combine(
    timestamp({ format: 'HH:mm:ss' }),
    errors({ stack: true }),
    lineFormat
  )
}));

module.exports = logger;
