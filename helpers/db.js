const mysql = require('mysql2/promise');
require('dotenv').config();

const rawUrl = process.env.MYSQL_PUBLIC_URL;
if (!rawUrl) {
  console.error('❌ MYSQL_PUBLIC_URL no está definida. Agrégala en Railway → backend service → Variables.');
  process.exit(1);
}

const u = new URL(rawUrl);
const pool = mysql.createPool({
  host:               u.hostname,
  port:               Number(u.port) || 3306,
  user:               decodeURIComponent(u.username),
  password:           decodeURIComponent(u.password),
  database:           'fl_snf_db',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+00:00'
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL conectado correctamente');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Error conectando a MySQL:', err.message);
  });

module.exports = pool;
