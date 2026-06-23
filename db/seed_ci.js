/**
 * CI-only seed: creates the minimum test users required by api.test.js
 * Expects DB_* env vars to be set (provided by GitHub Actions CI).
 */
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'fl_snf_db',
    port: Number(process.env.DB_PORT) || 3306,
  });

  const adminId = uuidv4();
  const obraUserId = uuidv4();
  const obraId = uuidv4();

  const adminHash = await bcrypt.hash('1234', 10);
  const obraHash = await bcrypt.hash('5678', 10);

  // Admin user
  await conn.query(
    `INSERT INTO usuarios (id, usuario, contrasena, rol, nombre, activo)
     VALUES (?, 'admin', ?, 'admin', 'Admin CI', 1)
     ON DUPLICATE KEY UPDATE id=id`,
    [adminId, adminHash]
  );

  // Obra user (needs obra_id set after obra is created)
  await conn.query(
    `INSERT INTO usuarios (id, usuario, contrasena, rol, nombre, activo)
     VALUES (?, 'obra', ?, 'usuario', 'Obra CI', 1)
     ON DUPLICATE KEY UPDATE id=id`,
    [obraUserId, obraHash]
  );

  // Retrieve actual obra user id (in case of duplicate key it was not inserted)
  const [[obraUser]] = await conn.query(
    `SELECT id FROM usuarios WHERE usuario = 'obra'`
  );

  // Create obra linked to obra user
  await conn.query(
    `INSERT INTO obras (id, nombre_obra, rfc, estado, activo, creado_por)
     VALUES (?, 'Obra CI Test', 'OCI850312AB3', 'CDMX', 1, ?)
     ON DUPLICATE KEY UPDATE id=id`,
    [obraId, obraUser.id]
  );

  await conn.query(
    `UPDATE usuarios SET obra_id = ? WHERE usuario = 'obra'`,
    [obraId]
  );

  await conn.end();
  console.log('CI seed complete: admin and obra users created.');
}

seed().catch(err => {
  console.error('CI seed failed:', err.message);
  process.exit(1);
});
