const mysql = require('mysql2/promise');
require('dotenv').config();
const logger = require('./logger');

let poolConfig;

if (process.env.NODE_ENV === 'development') {
  poolConfig = {
    host:     process.env.DB_HOST || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'fl_snf_db',
  };
} else {
  const rawUrl = process.env.MYSQL_PUBLIC_URL;
  if (!rawUrl) {
    logger.error('MYSQL_PUBLIC_URL no está definida. Agrégala en Railway → backend service → Variables.');
    process.exit(1);
  }
  const u = new URL(rawUrl);
  poolConfig = {
    host:     u.hostname,
    port:     Number(u.port) || 3306,
    user:     decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace('/', '') || 'fl_snf_db',
    // DB_SSL_REJECT_UNAUTHORIZED=false solo si el proveedor usa cert autofirmado
    // y no hay forma de proveer el CA. Por defecto: true (seguro).
    ssl:      { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
  };
}

const pool = mysql.createPool({
  ...poolConfig,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+00:00',
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    logger.info('MySQL conectado correctamente');
    conn.release();
  })
  .catch(err => {
    logger.error(`Error conectando a MySQL: ${err.message}`);
  });

module.exports = pool;
