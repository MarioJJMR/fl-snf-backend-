-- Crear base de datos
CREATE DATABASE IF NOT EXISTS fl_snf_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fl_snf_db;

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id              VARCHAR(36) PRIMARY KEY,
  usuario         VARCHAR(50) UNIQUE NOT NULL,
  contrasena      VARCHAR(100) NOT NULL,
  rol             ENUM('admin','usuario') DEFAULT 'usuario',
  nombre          VARCHAR(100),
  nombre_completo VARCHAR(150),
  email           VARCHAR(150) UNIQUE,
  activo          TINYINT(1) DEFAULT 1,
  fecha_registro  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de obras
CREATE TABLE IF NOT EXISTS obras (
  id                  VARCHAR(36) PRIMARY KEY,
  nombre_obra         VARCHAR(150) NOT NULL,
  rfc                 VARCHAR(20),
  estado              VARCHAR(50),
  direccion           VARCHAR(255),
  telefono            VARCHAR(20),
  correo              VARCHAR(100),
  personalidad_juridica VARCHAR(100),
  donataria           VARCHAR(10),
  activo              TINYINT(1) DEFAULT 1,
  creado_por          VARCHAR(36),
  fecha_registro      DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Tabla de formularios (datos flexibles en JSON)
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

-- Datos iniciales: usuarios por defecto
-- NOTA: Los hashes de bcrypt a continuación son de referencia y pueden no ser válidos.
-- Ejecuta `node db/seed.js` para generar hashes válidos e insertar usuarios correctamente.
INSERT IGNORE INTO usuarios (id, usuario, contrasena, rol, nombre) VALUES
('user-admin-001', 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHyy', 'admin', 'Administrador'),
('user-obra-001',  'obra',  '$2a$10$X/mDqRlO7OgJA1LMiAz9p.TF8aLrHbp.yqFnkzCvlQa3JgcXwSqh2', 'usuario', 'Usuario Obra');
