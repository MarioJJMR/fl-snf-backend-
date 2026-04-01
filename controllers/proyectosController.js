const pool = require('../helpers/db');

// GET /api/proyectos/:obraId
const getAll = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, tipo, datos, creado_por, actualizado_por, fecha_registro, fecha_actualizacion
       FROM proyectos WHERE obra_id = ? ORDER BY tipo, id`,
      [req.params.obraId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/proyectos/:obraId/:tipo  (tipo = 'vigente' | 'financiar')
const getByTipo = async (req, res) => {
  try {
    const { obraId, tipo } = req.params;
    if (!['vigente', 'financiar'].includes(tipo)) {
      return res.status(400).json({ success: false, error: "Tipo inválido. Use 'vigente' o 'financiar'" });
    }
    const [rows] = await pool.query(
      `SELECT id, tipo, datos, creado_por, actualizado_por, fecha_registro, fecha_actualizacion
       FROM proyectos WHERE obra_id = ? AND tipo = ? ORDER BY id`,
      [obraId, tipo]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/proyectos/:obraId/:tipo
const create = async (req, res) => {
  try {
    const { obraId, tipo } = req.params;
    if (!['vigente', 'financiar'].includes(tipo)) {
      return res.status(400).json({ success: false, error: "Tipo inválido. Use 'vigente' o 'financiar'" });
    }
    const datos = req.body;
    if (!datos || typeof datos !== 'object') {
      return res.status(400).json({ success: false, error: 'Se requiere un objeto JSON con los datos del proyecto' });
    }

    const [result] = await pool.query(
      `INSERT INTO proyectos (obra_id, tipo, datos, creado_por, actualizado_por)
       VALUES (?, ?, ?, ?, ?)`,
      [obraId, tipo, JSON.stringify(datos), req.user.id, req.user.id]
    );
    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Proyecto creado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// PUT /api/proyectos/:id
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const datos = req.body;
    if (!datos || typeof datos !== 'object') {
      return res.status(400).json({ success: false, error: 'Se requiere un objeto JSON con los datos a actualizar' });
    }

    const [rows] = await pool.query('SELECT obra_id FROM proyectos WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });
    }

    // Solo admin puede editar proyectos de otras obras
    const session = req.user;
    if (session.rol !== 'admin' && rows[0].obra_id !== session.obra_id) {
      return res.status(403).json({ success: false, error: 'Sin permiso para editar este proyecto' });
    }

    await pool.query(
      `UPDATE proyectos
       SET datos = JSON_MERGE_PATCH(datos, ?), actualizado_por = ?
       WHERE id = ?`,
      [JSON.stringify(datos), session.id, id]
    );
    res.json({ success: true, message: 'Proyecto actualizado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/proyectos/:id
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT obra_id FROM proyectos WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });
    }

    const session = req.user;
    if (session.rol !== 'admin' && rows[0].obra_id !== session.obra_id) {
      return res.status(403).json({ success: false, error: 'Sin permiso para eliminar este proyecto' });
    }

    await pool.query('DELETE FROM proyectos WHERE id = ?', [id]);
    res.json({ success: true, message: 'Proyecto eliminado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getAll, getByTipo, create, update, remove };
