const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// DEBUG: mostrar variables MYSQL disponibles
console.log('🔍 Variables de entorno disponibles:');
Object.keys(process.env)
  .filter(k => k.includes('MYSQL') || k.includes('DB_') || k.includes('DATABASE'))
  .forEach(k => console.log(`   ${k} = ${process.env[k]?.slice(0, 30)}...`));

async function seed() {
  const url = process.env.MYSQL_PUBLIC_URL;
  if (!url) {
    throw new Error('MYSQL_PUBLIC_URL no está definida. Agrégala en Railway → backend service → Variables.');
  }

  const u = new URL(url);
  const connConfig = {
    host:               u.hostname,
    port:               Number(u.port) || 3306,
    user:               decodeURIComponent(u.username),
    password:           decodeURIComponent(u.password),
    multipleStatements: true
  };

  console.log(`🔌 Conectando a MySQL: ${connConfig.user}@${connConfig.host}:${connConfig.port}`);

  let conn;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    try {
      conn = await mysql.createConnection(connConfig);
      break;
    } catch (err) {
      attempts++;
      console.log(`  ↳ Intento ${attempts}/${maxAttempts} fallido (${err.code}). Reintentando en 3s...`);
      if (attempts >= maxAttempts) throw err;
      await new Promise(r => setTimeout(r, 3000));
    }
  }

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
      nombre_completo VARCHAR(150) DEFAULT NULL,
      email           VARCHAR(150) DEFAULT NULL UNIQUE,
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
      status              ENUM('nuevo','aprobado','rechazado','cerrado') DEFAULT 'nuevo',
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
      categoria         VARCHAR(100) NOT NULL DEFAULT 'general',
      mime_type         VARCHAR(100),
      tamano            BIGINT UNSIGNED,
      subido_por        VARCHAR(36),
      fecha_subida      DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_obra (obra_id),
      CONSTRAINT fk_documentos_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
      CONSTRAINT fk_documentos_usuario FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `);

  // ── 6. notificaciones ──────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS notificaciones (
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

  // ── 7. notificaciones_vistas ───────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS notificaciones_vistas (
      notif_id  INT NOT NULL,
      obra_id   VARCHAR(36) NOT NULL,
      fecha     DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (notif_id, obra_id),
      FOREIGN KEY (notif_id) REFERENCES notificaciones(id) ON DELETE CASCADE
    )
  `);

  // ── 9. sesiones_revocadas (blacklist de JWTs para logout real) ─────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS sesiones_revocadas (
      jti       VARCHAR(36) PRIMARY KEY,
      expira_en DATETIME NOT NULL,
      INDEX idx_expira (expira_en)
    )
  `);

  // ── 10. password_reset_tokens ──────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token      VARCHAR(36) PRIMARY KEY,
      user_id    VARCHAR(36) NOT NULL,
      expira_en  DATETIME NOT NULL,
      usado      TINYINT(1) DEFAULT 0,
      INDEX idx_user (user_id),
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

  // Fix: email y nombre_completo en usuarios (instalaciones anteriores)
  await safeAlter(conn,
    `ALTER TABLE usuarios ADD COLUMN email VARCHAR(150) DEFAULT NULL UNIQUE AFTER nombre`,
    'email ya existe en usuarios'
  );
  await safeAlter(conn,
    `ALTER TABLE usuarios ADD COLUMN nombre_completo VARCHAR(150) DEFAULT NULL AFTER nombre`,
    'nombre_completo ya existe en usuarios'
  );

  // Fix: status en proyectos (instalaciones anteriores sin la columna)
  await safeAlter(conn,
    `ALTER TABLE proyectos ADD COLUMN status ENUM('nuevo','aprobado','rechazado','cerrado') DEFAULT 'nuevo' AFTER tipo`,
    'status ya existe en proyectos'
  );

  // Fix #5: tamano BIGINT en documentos
  await safeAlter(conn,
    `ALTER TABLE documentos MODIFY COLUMN tamano BIGINT UNSIGNED`,
    'tamano ya es BIGINT'
  );

  // Fix: columna categoria en documentos (instalaciones anteriores)
  await safeAlter(conn,
    `ALTER TABLE documentos ADD COLUMN categoria VARCHAR(100) NOT NULL DEFAULT 'general' AFTER nombre_archivo`,
    'categoria ya existe en documentos'
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

  // ── Seed obras ─────────────────────────────────────────────────────────────
  const obrasSeed = [
    {
      id:          '61a66a17-d235-441b-ba08-3ab13009e674',
      nombre_obra: 'Obra San Ignacio',
      estado:      'Jalisco',
      direccion:   'Av. San Ignacio 100, Guadalajara',
      telefono:    '3310000001',
      correo:      'contacto@obra.mx'
    },
    {
      id:          '7061fe6c-77dd-453d-bb94-69a62df8caf6',
      nombre_obra: 'Centro Comunitario San Ignacio',
      estado:      'Jalisco',
      direccion:   'Calle Comunidad 200, Guadalajara',
      telefono:    '3310000002',
      correo:      'director@sanignacio.org.mx'
    }
  ];

  for (const o of obrasSeed) {
    await conn.query(
      `INSERT IGNORE INTO obras (id, nombre_obra, estado, direccion, telefono, correo) VALUES (?, ?, ?, ?, ?, ?)`,
      [o.id, o.nombre_obra, o.estado, o.direccion, o.telefono, o.correo]
    );
  }

  // ── Seed users ─────────────────────────────────────────────────────────────
  const defaultHash     = await bcrypt.hash('12345678', 10);
  const plataformaHash  = await bcrypt.hash('12345678', 10);

  const users = [
    // Admin global Fundación Loyola
    { id: uuidv4(), usuario: 'plataforma', nombre: 'Plataforma Fundación Loyola', email: 'plataforma@fundacionloyola.mx', hash: plataformaHash, rol: 'admin',   obra_id: null },
    // Obra San Ignacio
    { id: uuidv4(), usuario: 'admin.sanignacio',    nombre: 'Administrador San Ignacio', email: 'admin@obra.mx',    hash: defaultHash, rol: 'usuario', obra_id: '61a66a17-d235-441b-ba08-3ab13009e674' },
    { id: uuidv4(), usuario: 'director.sanignacio', nombre: 'Director San Ignacio',      email: 'director@obra.mx', hash: defaultHash, rol: 'usuario', obra_id: '61a66a17-d235-441b-ba08-3ab13009e674' },
    { id: uuidv4(), usuario: 'gestor.sanignacio',   nombre: 'Gestor San Ignacio',        email: 'gestor@obra.mx',   hash: defaultHash, rol: 'usuario', obra_id: '61a66a17-d235-441b-ba08-3ab13009e674' },
    // Centro Comunitario San Ignacio
    { id: uuidv4(), usuario: 'admin.ccsi',    nombre: 'Administrador CCSI', email: 'admin@sanignacio.org.mx',    hash: defaultHash, rol: 'usuario', obra_id: '7061fe6c-77dd-453d-bb94-69a62df8caf6' },
    { id: uuidv4(), usuario: 'director.ccsi', nombre: 'Director CCSI',      email: 'director@sanignacio.org.mx', hash: defaultHash, rol: 'usuario', obra_id: '7061fe6c-77dd-453d-bb94-69a62df8caf6' },
    { id: uuidv4(), usuario: 'gestor.ccsi',   nombre: 'Gestor CCSI',        email: 'gestor@sanignacio.org.mx',   hash: defaultHash, rol: 'usuario', obra_id: '7061fe6c-77dd-453d-bb94-69a62df8caf6' },
  ];

  for (const u of users) {
    await conn.query(
      `INSERT IGNORE INTO usuarios (id, usuario, contrasena, rol, nombre, email, obra_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [u.id, u.usuario, u.hash, u.rol, u.nombre, u.email, u.obra_id]
    );
  }

  // ── Seed proyectos de ejemplo ──────────────────────────────────────────────
  const proyectosSeed = [
    { tipo: 'vigente',  status: 'aprobado', datos: { nombre: 'Programa de Becas Secundaria 2026', descripcion: 'Apoyo económico a estudiantes en situación de vulnerabilidad', monto_solicitado: 150000, beneficiarios: 45 } },
    { tipo: 'vigente',  status: 'nuevo',    datos: { nombre: 'Taller de Oficios para Jóvenes', descripcion: 'Capacitación en carpintería, electricidad y plomería', monto_solicitado: 80000, beneficiarios: 30 } },
    { tipo: 'financiar', status: 'nuevo',   datos: { nombre: 'Construcción Aula Comunitaria', descripcion: 'Nuevo espacio para actividades educativas y culturales', monto_solicitado: 350000, beneficiarios: 120 } },
    { tipo: 'financiar', status: 'rechazado', datos: { nombre: 'Equipo de Cómputo para Biblioteca', descripcion: 'Adquisición de 20 computadoras para sala de cómputo', monto_solicitado: 200000, beneficiarios: 200 } },
  ];

  // Obtener el id del usuario plataforma para creado_por
  const [[adminUser]] = await conn.query(`SELECT id FROM usuarios WHERE usuario = 'plataforma' LIMIT 1`);
  const adminUserId = adminUser?.id || null;
  const seedObraId  = '61a66a17-d235-441b-ba08-3ab13009e674'; // Obra San Ignacio

  for (const p of proyectosSeed) {
    const [[existing]] = await conn.query(
      `SELECT id FROM proyectos WHERE obra_id = ? AND JSON_EXTRACT(datos, '$.nombre') = ? LIMIT 1`,
      [seedObraId, p.datos.nombre]
    );
    if (!existing) {
      await conn.query(
        `INSERT INTO proyectos (obra_id, tipo, status, datos, creado_por, actualizado_por) VALUES (?, ?, ?, ?, ?, ?)`,
        [seedObraId, p.tipo, p.status, JSON.stringify(p.datos), adminUserId, adminUserId]
      );
    }
  }

  console.log('✅ Base de datos inicializada correctamente');
  console.log('👤 Admin:    plataforma@fundacionloyola.mx / 12345678');
  console.log('👤 Obra San Ignacio:          admin@obra.mx | director@obra.mx | gestor@obra.mx  / 12345678');
  console.log('👤 Centro Comunitario CCSI:   admin@sanignacio.org.mx | director@sanignacio.org.mx | gestor@sanignacio.org.mx  / 12345678');
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
  console.error('❌ Error en seed:', err.message || err);
  process.exit(1);
});
