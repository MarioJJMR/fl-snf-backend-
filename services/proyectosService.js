const pool = require('../helpers/db');

const TIPOS_VALIDOS = ['vigente', 'financiar'];

async function getAll(obraId) {
  const [rows] = await pool.query(
    `SELECT id, tipo, datos, creado_por, actualizado_por, fecha_registro, fecha_actualizacion
     FROM proyectos WHERE obra_id = ? ORDER BY tipo, id`,
    [obraId]
  );
  return rows;
}

async function getByTipo(obraId, tipo) {
  const [rows] = await pool.query(
    `SELECT id, tipo, datos, creado_por, actualizado_por, fecha_registro, fecha_actualizacion
     FROM proyectos WHERE obra_id = ? AND tipo = ? ORDER BY id`,
    [obraId, tipo]
  );
  return rows;
}

async function getById(id) {
  const [rows] = await pool.query('SELECT obra_id FROM proyectos WHERE id = ?', [id]);
  return rows[0] || null;
}

async function create({ obraId, tipo, datos, userId }) {
  const [result] = await pool.query(
    `INSERT INTO proyectos (obra_id, tipo, datos, creado_por, actualizado_por)
     VALUES (?, ?, ?, ?, ?)`,
    [obraId, tipo, JSON.stringify(datos), userId, userId]
  );
  return { id: result.insertId };
}

async function update(id, { datos, userId }) {
  await pool.query(
    `UPDATE proyectos SET datos = JSON_MERGE_PATCH(datos, ?), actualizado_por = ? WHERE id = ?`,
    [JSON.stringify(datos), userId, id]
  );
}

async function remove(id) {
  await pool.query('DELETE FROM proyectos WHERE id = ?', [id]);
}

module.exports = { TIPOS_VALIDOS, getAll, getByTipo, getById, create, update, remove };
