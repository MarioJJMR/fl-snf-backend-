const bcrypt = require('bcryptjs');
const pool = require('../helpers/db');
const { v4: uuidv4 } = require('uuid');

const getAll = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, usuario, rol, nombre, obra_id, activo, fecha_registro FROM usuarios WHERE activo = 1'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { usuario, contrasena, rol, nombre, obra_id } = req.body;
    if (!usuario || !contrasena)
      return res.status(400).json({ success: false, error: 'usuario y contrasena requeridos' });

    const [existing] = await pool.query('SELECT id FROM usuarios WHERE usuario = ?', [usuario]);
    if (existing.length > 0)
      return res.status(409).json({ success: false, error: 'El usuario ya existe' });

    const id = uuidv4();
    const hash = await bcrypt.hash(contrasena, 10);
    await pool.query(
      'INSERT INTO usuarios (id, usuario, contrasena, rol, nombre, obra_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, usuario, hash, rol || 'usuario', nombre || usuario, obra_id || null]
    );

    res.status(201).json({ success: true, data: { id, usuario, rol, nombre, obra_id: obra_id || null }, message: 'Usuario creado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { contrasena, nombre, rol, obra_id } = req.body;

    const [check] = await pool.query('SELECT id FROM usuarios WHERE id = ? AND activo = 1', [id]);
    if (check.length === 0)
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    if (contrasena) {
      const hash = await bcrypt.hash(contrasena, 10);
      await pool.query('UPDATE usuarios SET contrasena=?, nombre=?, rol=?, obra_id=? WHERE id=?', [hash, nombre, rol, obra_id ?? null, id]);
    } else {
      await pool.query('UPDATE usuarios SET nombre=?, rol=?, obra_id=? WHERE id=?', [nombre, rol, obra_id ?? null, id]);
    }

    const [rows] = await pool.query('SELECT id, usuario, rol, nombre, obra_id, activo FROM usuarios WHERE id = ?', [id]);
    res.json({ success: true, data: rows[0], message: 'Usuario actualizado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ success: false, error: 'No puedes eliminar tu propia cuenta' });

    const [check] = await pool.query('SELECT id FROM usuarios WHERE id = ? AND activo = 1', [req.params.id]);
    if (check.length === 0)
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getAll, create, update, remove };
