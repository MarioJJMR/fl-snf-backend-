const pool = require('../helpers/db');
const { v4: uuidv4 } = require('uuid');

async function getAll({ page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM obras WHERE activo = 1');
  const [rows] = await pool.query(
    'SELECT * FROM obras WHERE activo = 1 ORDER BY fecha_registro DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );
  return { rows, total };
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM obras WHERE id = ? AND activo = 1', [id]);
  return rows[0] || null;
}

async function create({ nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria, userId }) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO obras (id, nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria, userId]
  );
  const [rows] = await pool.query('SELECT * FROM obras WHERE id = ?', [id]);
  return rows[0];
}

async function update(id, { nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria }) {
  await pool.query(
    `UPDATE obras SET nombre_obra=?, rfc=?, estado=?, direccion=?, telefono=?, correo=?, personalidad_juridica=?, donataria=?
     WHERE id = ?`,
    [nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria, id]
  );
  const [rows] = await pool.query('SELECT * FROM obras WHERE id = ?', [id]);
  return rows[0];
}

async function remove(id) {
  await pool.query('UPDATE obras SET activo = 0 WHERE id = ?', [id]);
}

module.exports = { getAll, getById, create, update, remove };
