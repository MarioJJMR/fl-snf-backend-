const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

async function seed() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  console.log('🔧 Creando base de datos y tablas...');

  await conn.query(`CREATE DATABASE IF NOT EXISTS fl_snf_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE fl_snf_db`);

  // Desactivar FK checks para permitir creación en cualquier orden
  await conn.query(`SET FOREIGN_KEY_CHECKS = 0`);

  // ── 1. obras (sin FK a usuarios para romper dependencia circular) ──────────
  await conn.query(`
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
      INDEX idx_activo (activo)
    )
  `);

  // ── 2. usuarios (con FK a obras) ───────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id              VARCHAR(36) PRIMARY KEY,
      usuario         VARCHAR(50) UNIQUE NOT NULL,
      contrasena      VARCHAR(100) NOT NULL,
      rol             ENUM('admin','usuario') DEFAULT 'usuario',
      nombre          VARCHAR(100),
      obra_id         VARCHAR(36) DEFAULT NULL,
      activo          TINYINT(1) DEFAULT 1,
      fecha_registro  DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_usuarios_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL
    )
  `);

  // ── 3. formularios ─────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS formularios (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      obra_id             VARCHAR(36) NOT NULL,
      form_key            VARCHAR(50) NOT NULL,
      datos               JSON NOT NULL,
      actualizado_por     VARCHAR(36),
      fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_obra_form (obra_id, form_key),
      INDEX idx_obra (obra_id),
      CONSTRAINT fk_formularios_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
      CONSTRAINT fk_formularios_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `);

  // ── 4. proyectos ───────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS proyectos (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      obra_id             VARCHAR(36) NOT NULL,
      tipo                ENUM('vigente','financiar') NOT NULL,
      datos               JSON NOT NULL,
      creado_por          VARCHAR(36),
      actualizado_por     VARCHAR(36),
      fecha_registro      DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_obra_tipo (obra_id, tipo),
      CONSTRAINT fk_proyectos_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
      CONSTRAINT fk_proyectos_creado FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
      CONSTRAINT fk_proyectos_actualizado FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `);

  // ── 5. documentos ──────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS documentos (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      obra_id           VARCHAR(36) NOT NULL,
      nombre_original   VARCHAR(255) NOT NULL,
      nombre_archivo    VARCHAR(255) NOT NULL,
      mime_type         VARCHAR(100),
      tamano            BIGINT UNSIGNED,
      subido_por        VARCHAR(36),
      fecha_subida      DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_obra (obra_id),
      CONSTRAINT fk_documentos_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
      CONSTRAINT fk_documentos_usuario FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `);

  // ── 6. sesiones_revocadas (blacklist de JWTs para logout real) ─────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS sesiones_revocadas (
      jti       VARCHAR(36) PRIMARY KEY,
      expira_en DATETIME NOT NULL,
      INDEX idx_expira (expira_en)
    )
  `);

  // Reactivar FK checks
  await conn.query(`SET FOREIGN_KEY_CHECKS = 1`);

  // ── ALTER TABLE para instalaciones existentes (agrega columnas y FKs faltantes) ──
  console.log('🔧 Verificando columnas e índices en tablas existentes...');

  // Fix #1: obra_id en usuarios
  await safeAlter(conn,
    `ALTER TABLE usuarios ADD COLUMN obra_id VARCHAR(36) DEFAULT NULL AFTER nombre`,
    'obra_id ya existe en usuarios'
  );

  // Fix #5: tamano BIGINT en documentos
  await safeAlter(conn,
    `ALTER TABLE documentos MODIFY COLUMN tamano BIGINT UNSIGNED`,
    'tamano ya es BIGINT'
  );

  // Fix #6: índices faltantes
  await safeAlter(conn,
    `ALTER TABLE obras ADD INDEX idx_activo (activo)`,
    'idx_activo ya existe en obras'
  );
  await safeAlter(conn,
    `ALTER TABLE formularios ADD INDEX idx_obra (obra_id)`,
    'idx_obra ya existe en formularios'
  );

  // Fix #4: FKs para instalaciones existentes
  // (FOREIGN_KEY_CHECKS=0 para no fallar con datos huérfanos previos)
  await conn.query(`SET FOREIGN_KEY_CHECKS = 0`);
  await safeAlter(conn,
    `ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL`,
    'fk_usuarios_obra ya existe'
  );
  await safeAlter(conn,
    `ALTER TABLE formularios ADD CONSTRAINT fk_formularios_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE`,
    'fk_formularios_obra ya existe'
  );
  await safeAlter(conn,
    `ALTER TABLE formularios ADD CONSTRAINT fk_formularios_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL`,
    'fk_formularios_usuario ya existe'
  );
  await safeAlter(conn,
    `ALTER TABLE proyectos ADD CONSTRAINT fk_proyectos_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE`,
    'fk_proyectos_obra ya existe'
  );
  await safeAlter(conn,
    `ALTER TABLE proyectos ADD CONSTRAINT fk_proyectos_creado FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL`,
    'fk_proyectos_creado ya existe'
  );
  await safeAlter(conn,
    `ALTER TABLE proyectos ADD CONSTRAINT fk_proyectos_actualizado FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL`,
    'fk_proyectos_actualizado ya existe'
  );
  await safeAlter(conn,
    `ALTER TABLE documentos ADD CONSTRAINT fk_documentos_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE`,
    'fk_documentos_obra ya existe'
  );
  await safeAlter(conn,
    `ALTER TABLE documentos ADD CONSTRAINT fk_documentos_usuario FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE SET NULL`,
    'fk_documentos_usuario ya existe'
  );

  await conn.query(`SET FOREIGN_KEY_CHECKS = 1`);

  // ── Seed users ─────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('1234', 10);
  const obraHash  = await bcrypt.hash('5678', 10);

  const users = [
    [uuidv4(), 'admin', adminHash, 'admin', 'Administrador'],
    [uuidv4(), 'obra',  obraHash,  'usuario', 'Usuario Obra']
  ];

  for (const [id, usuario, contrasena, rol, nombre] of users) {
    await conn.query(
      `INSERT IGNORE INTO usuarios (id, usuario, contrasena, rol, nombre) VALUES (?, ?, ?, ?, ?)`,
      [id, usuario, contrasena, rol, nombre]
    );
  }

  console.log('✅ Base de datos inicializada correctamente');
  console.log('👤 Usuarios: admin/1234 y obra/5678');
  await conn.end();
}

// Ejecuta un ALTER TABLE ignorando errores de "ya existe" (errno 1060, 1061, 1826)
async function safeAlter(conn, sql, skipMsg) {
  try {
    await conn.query(sql);
  } catch (err) {
    const ignorable = [1060, 1061, 1826, 1005]; // duplicate column, duplicate key, duplicate FK, can't create
    if (ignorable.includes(err.errno)) {
      console.log(`  ↳ Omitido: ${skipMsg}`);
    } else {
      throw err;
    }
  }
}

seed().catch(err => {
  console.error('❌ Error en seed:', err.message);
  process.exit(1);
});
