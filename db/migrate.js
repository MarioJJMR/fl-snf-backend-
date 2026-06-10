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
      database: u.pathname.replace('/', ''),
      ssl:      { rejectUnauthorized: false },
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

  // Migración: columna nombre_completo
  const [nombreCompletoCols] = await conn.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',
    [dbName, 'usuarios', 'nombre_completo']
  );
  if (nombreCompletoCols.length === 0) {
    await conn.query('ALTER TABLE usuarios ADD COLUMN nombre_completo VARCHAR(150) NULL AFTER nombre');
    console.log('✅ Columna nombre_completo agregada a usuarios');
  } else {
    console.log('✓ Columna nombre_completo ya existe');
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

  // Migración: tabla proyectos
  const [proyectosTable] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [dbName, 'proyectos']
  );
  if (proyectosTable.length === 0) {
    await conn.query(`
      CREATE TABLE proyectos (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        obra_id             VARCHAR(36) NOT NULL,
        tipo                ENUM('vigente', 'financiar') NOT NULL,
        datos               JSON NOT NULL,
        creado_por          VARCHAR(36),
        actualizado_por     VARCHAR(36),
        fecha_registro      DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_actualizacion DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_obra_tipo (obra_id, tipo),
        FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
        FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
        FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ Tabla proyectos creada');
  } else {
    console.log('✓ Tabla proyectos ya existe');
  }

  // Migración: columna categoria en documentos
  const [categoriaCols] = await conn.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',
    [dbName, 'documentos', 'categoria']
  );
  if (categoriaCols.length === 0) {
    await conn.query(
      `ALTER TABLE documentos ADD COLUMN categoria VARCHAR(100) NOT NULL DEFAULT 'general' AFTER nombre_archivo`
    );
    console.log('✅ Columna categoria agregada a documentos');
  } else {
    console.log('✓ Columna categoria ya existe en documentos');
  }

  // Migración: tabla documentos
  const [documentosTable] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [dbName, 'documentos']
  );
  if (documentosTable.length === 0) {
    await conn.query(`
      CREATE TABLE documentos (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        obra_id          VARCHAR(36) NOT NULL,
        nombre_original  VARCHAR(255) NOT NULL,
        nombre_archivo   VARCHAR(500) NOT NULL,
        categoria        VARCHAR(100) NOT NULL DEFAULT 'general',
        mime_type        VARCHAR(100),
        tamano           BIGINT,
        subido_por       VARCHAR(36),
        fecha_subida     DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_obra (obra_id),
        FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
        FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ Tabla documentos creada');
  } else {
    console.log('✓ Tabla documentos ya existe');
  }

  // Migración: tabla notificaciones
  const [notifTable] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [dbName, 'notificaciones']
  );
  if (notifTable.length === 0) {
    await conn.query(`
      CREATE TABLE notificaciones (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        asunto          VARCHAR(255) NOT NULL,
        mensaje         TEXT NOT NULL,
        destinatarios   JSON NOT NULL,
        nombres_obras   JSON,
        enviado_por     VARCHAR(36),
        total_enviados  INT DEFAULT 0,
        fecha_envio     DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_fecha (fecha_envio),
        FOREIGN KEY (enviado_por) REFERENCES usuarios(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ Tabla notificaciones creada');
  } else {
    console.log('✓ Tabla notificaciones ya existe');
  }

  // Migración: tabla notificaciones_vistas
  const [vistasTable] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [dbName, 'notificaciones_vistas']
  );
  if (vistasTable.length === 0) {
    await conn.query(`
      CREATE TABLE notificaciones_vistas (
        notif_id  INT NOT NULL,
        obra_id   VARCHAR(36) NOT NULL,
        fecha     DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (notif_id, obra_id),
        FOREIGN KEY (notif_id) REFERENCES notificaciones(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Tabla notificaciones_vistas creada');
  } else {
    console.log('✓ Tabla notificaciones_vistas ya existe');
  }

  await conn.end();
  console.log('Migración completa');
}

migrate().catch(err => {
  console.error('❌ Error en migración:', err.message);
  process.exit(1);
});
