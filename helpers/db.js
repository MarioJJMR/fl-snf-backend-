const mysql = require('mysql2/promise');
require('dotenv').config();

const mysqlUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;

const pool = mysqlUrl
  ? mysql.createPool(mysqlUrl + '?waitForConnections=true&connectionLimit=10&queueLimit=0&timezone=%2B00%3A00')
  : mysql.createPool({
      host:     process.env.DB_HOST     || process.env.MYSQLHOST     || 'localhost',
      port:     Number(process.env.DB_PORT || process.env.MYSQLPORT  || 3306),
      user:     process.env.DB_USER     || process.env.MYSQLUSER     || 'root',
      password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
      database: process.env.DB_NAME     || process.env.MYSQLDATABASE || 'fl_snf_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: '+00:00'
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
