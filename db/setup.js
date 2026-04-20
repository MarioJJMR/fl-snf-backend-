require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function setup() {
  const u = new URL(process.env.MYSQL_PUBLIC_URL);
  const conn = await mysql.createConnection({
    host:               u.hostname,
    port:               Number(u.port) || 3306,
    user:               decodeURIComponent(u.username),
    password:           decodeURIComponent(u.password),
    database:           u.pathname.replace('/', ''),
    multipleStatements: true
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id              VARCHAR(36) PRIMARY KEY,
      usuario         VARCHAR(50) UNIQUE NOT NULL,
      contrasena      VARCHAR(100) NOT NULL,
      rol             ENUM('admin','usuario') DEFAULT 'usuario',
      nombre          VARCHAR(100),
      activo          TINYINT(1) DEFAULT 1,
      fecha_registro  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS obras (
      id                    VARCHAR(36) PRIMARY KEY,
      nombre_obra           VARCHAR(150) NOT NULL,
      rfc                   VARCHAR(20),
      estado                VARCHAR(50),
      direccion             VARCHAR(255),
      telefono              VARCHAR(20),
      correo                VARCHAR(100),
      personalidad_juridica VARCHAR(100),
      donataria             VARCHAR(10),
      activo                TINYINT(1) DEFAULT 1,
      creado_por            VARCHAR(36),
      fecha_registro        DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion   DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS formularios (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      obra_id             VARCHAR(36) NOT NULL,
      form_key            VARCHAR(50) NOT NULL,
      datos               JSON NOT NULL,
      actualizado_por     VARCHAR(36),
      fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_obra_form (obra_id, form_key),
      FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
      FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sesiones_revocadas (
      jti        VARCHAR(36) PRIMARY KEY,
      expira_en  DATETIME NOT NULL,
      INDEX idx_expira (expira_en)
    );

    INSERT IGNORE INTO usuarios (id, usuario, contrasena, rol, nombre) VALUES
      ('user-admin-001', 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHyy', 'admin', 'Administrador'),
      ('user-obra-001',  'obra',  '$2a$10$X/mDqRlO7OgJA1LMiAz9p.TF8aLrHbp.yqFnkzCvlQa3JgcXwSqh2', 'usuario', 'Usuario Obra');
  `);

  console.log('✅ Tablas creadas correctamente');
  await conn.end();
}

setup().catch(err => {
  console.error('❌ Error en setup:', err.message);
  process.exit(1);
});
