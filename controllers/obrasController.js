const pool = require('../helpers/db');
const { v4: uuidv4 } = require('uuid');

const getAll = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM obras WHERE activo = 1 ORDER BY fecha_registro DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const getById = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM obras WHERE id = ? AND activo = 1', [req.params.id]);
    if (rows.length === 0)
      return res.status(404).json({ success: false, error: 'Obra no encontrada' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria } = req.body;
    if (!nombre_obra)
      return res.status(400).json({ success: false, error: 'nombre_obra es requerido' });

    const id = uuidv4();
    await pool.query(
      `INSERT INTO obras (id, nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria, req.user.id]
    );

    const [rows] = await pool.query('SELECT * FROM obras WHERE id = ?', [id]);
    res.status(201).json({ success: true, data: rows[0], message: 'Obra creada' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria } = req.body;

    const [check] = await pool.query('SELECT id FROM obras WHERE id = ? AND activo = 1', [id]);
    if (check.length === 0)
      return res.status(404).json({ success: false, error: 'Obra no encontrada' });

    await pool.query(
      `UPDATE obras SET nombre_obra=?, rfc=?, estado=?, direccion=?, telefono=?, correo=?, personalidad_juridica=?, donataria=?
       WHERE id = ?`,
      [nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria, id]
    );

    const [rows] = await pool.query('SELECT * FROM obras WHERE id = ?', [id]);
    res.json({ success: true, data: rows[0], message: 'Obra actualizada' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const [check] = await pool.query('SELECT id FROM obras WHERE id = ? AND activo = 1', [req.params.id]);
    if (check.length === 0)
      return res.status(404).json({ success: false, error: 'Obra no encontrada' });

    await pool.query('UPDATE obras SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Obra eliminada' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getAll, getById, create, update, remove };
