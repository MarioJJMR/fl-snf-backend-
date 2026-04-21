require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function migrate() {
  let connConfig;
  if (process.env.MYSQL_PUBLIC_URL) {
    const u = new URL(process.env.MYSQL_PUBLIC_URL);
    connConfig = {
      host:     u.hostname,
      port:     Number(u.port) || 3306,
      user:     decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace('/', '')
    };
  } else {
    connConfig = {
      host:     process.env.DB_HOST || 'localhost',
      user:     process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'fl_snf_db'
    };
  }
  const conn = await mysql.createConnection(connConfig);

  const dbName = connConfig.database;
  const [cols] = await conn.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',
    [dbName, 'usuarios', 'obra_id']
  );

  if (cols.length === 0) {
    await conn.query('ALTER TABLE usuarios ADD COLUMN obra_id VARCHAR(36) NULL');
    console.log('✅ Columna obra_id agregada a usuarios');
  } else {
    console.log('✓ Columna obra_id ya existe');
  }

  // Migración: columna email para Google OAuth
  const [emailCols] = await conn.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',
    [dbName, 'usuarios', 'email']
  );
  if (emailCols.length === 0) {
    await conn.query('ALTER TABLE usuarios ADD COLUMN email VARCHAR(150) NULL UNIQUE AFTER nombre');
    console.log('✅ Columna email agregada a usuarios');
  } else {
    console.log('✓ Columna email ya existe');
  }

  // Migración: tabla password_reset_tokens
  const [resetTable] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [dbName, 'password_reset_tokens']
  );
  if (resetTable.length === 0) {
    await conn.query(`
      CREATE TABLE password_reset_tokens (
        token      VARCHAR(36) PRIMARY KEY,
        user_id    VARCHAR(36) NOT NULL,
        expira_en  DATETIME NOT NULL,
        usado      TINYINT(1) DEFAULT 0,
        INDEX idx_user (user_id),
        INDEX idx_expira (expira_en)
      )
    `);
    console.log('✅ Tabla password_reset_tokens creada');
  } else {
    console.log('✓ Tabla password_reset_tokens ya existe');
  }

  await conn.end();
  console.log('Migración completa');
}

migrate().catch(err => {
  console.error('❌ Error en migración:', err.message);
  process.exit(1);
});
