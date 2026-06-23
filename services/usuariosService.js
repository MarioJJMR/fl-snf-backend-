const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../helpers/db');

async function getAll({ page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1');
  const [rows] = await pool.query(
    'SELECT id, usuario, rol, nombre, email, obra_id, activo, fecha_registro FROM usuarios WHERE activo = 1 LIMIT ? OFFSET ?',
    [limit, offset]
  );
  return { rows, total };
}

async function findById(id) {
  const [rows] = await pool.query('SELECT id FROM usuarios WHERE id = ? AND activo = 1', [id]);
  return rows[0] || null;
}

async function getByObra(obraId) {
  const [rows] = await pool.query(
    'SELECT id, usuario, nombre, email, rol, fecha_registro FROM usuarios WHERE obra_id = ? AND activo = 1',
    [obraId]
  );
  return rows;
}

async function existsByUsername(usuario) {
  const [rows] = await pool.query('SELECT id FROM usuarios WHERE usuario = ?', [usuario]);
  return rows.length > 0;
}

async function create({ usuario, contrasena, rol, nombre, email, obra_id }) {
  const id = uuidv4();
  const hash = await bcrypt.hash(contrasena, 10);
  await pool.query(
    'INSERT INTO usuarios (id, usuario, contrasena, rol, nombre, email, obra_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, usuario, hash, rol || 'usuario', nombre || usuario, email || null, obra_id || null]
  );
  return { id, usuario, rol: rol || 'usuario', nombre: nombre || usuario, email: email || null, obra_id: obra_id || null };
}

async function update(id, { contrasena, nombre, rol, email, obra_id }) {
  if (contrasena) {
    const hash = await bcrypt.hash(contrasena, 10);
    await pool.query(
      'UPDATE usuarios SET contrasena=?, nombre=?, rol=?, email=?, obra_id=? WHERE id=?',
      [hash, nombre, rol, email ?? null, obra_id ?? null, id]
    );
  } else {
    await pool.query(
      'UPDATE usuarios SET nombre=?, rol=?, email=?, obra_id=? WHERE id=?',
      [nombre, rol, email ?? null, obra_id ?? null, id]
    );
  }
  const [rows] = await pool.query(
    'SELECT id, usuario, rol, nombre, email, obra_id, activo FROM usuarios WHERE id = ?',
    [id]
  );
  return rows[0];
}

async function remove(id) {
  await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [id]);
}

module.exports = { getAll, getByObra, findById, existsByUsername, create, update, remove };
