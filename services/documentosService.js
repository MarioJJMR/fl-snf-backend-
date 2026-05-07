const path = require('path');
const fs = require('fs');
const pool = require('../helpers/db');
const { UPLOADS_DIR } = require('../helpers/upload');

async function getAll(obraId) {
  const [rows] = await pool.query(
    `SELECT id, nombre_original, nombre_archivo, mime_type, tamano, subido_por, fecha_subida
     FROM documentos WHERE obra_id = ? ORDER BY fecha_subida DESC`,
    [obraId]
  );
  return rows;
}

async function getById(id) {
  const [rows] = await pool.query(
    'SELECT nombre_original, nombre_archivo, mime_type, obra_id, subido_por FROM documentos WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function insertMany(obraId, files, userId) {
  const values = files.map(f => [obraId, f.originalname, f.filename, f.mimetype, f.size, userId]);
  const [result] = await pool.query(
    `INSERT INTO documentos (obra_id, nombre_original, nombre_archivo, mime_type, tamano, subido_por) VALUES ?`,
    [values]
  );
  return files.map((f, i) => ({
    id: result.insertId + i,
    nombre_original: f.originalname,
    nombre_archivo: f.filename,
    mime_type: f.mimetype,
    tamano: f.size
  }));
}

function getFilePath(nombre_archivo) {
  return path.join(UPLOADS_DIR, nombre_archivo);
}

async function remove(id) {
  const doc = await getById(id);
  if (!doc) return null;

  await pool.query('DELETE FROM documentos WHERE id = ?', [id]);

  const filePath = getFilePath(doc.nombre_archivo);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  return doc;
}

module.exports = { getAll, getById, insertMany, getFilePath, remove };
