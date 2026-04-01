const pool = require('../helpers/db');

const getAll = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT form_key, datos, fecha_actualizacion FROM formularios WHERE obra_id = ?',
      [req.params.obraId]
    );
    const result = {};
    for (const row of rows) {
      result[row.form_key] = { ...row.datos, _meta: { fechaActualizacion: row.fecha_actualizacion } };
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const getFormulario = async (req, res) => {
  try {
    const { obraId, formKey } = req.params;
    const [rows] = await pool.query(
      'SELECT datos, fecha_actualizacion FROM formularios WHERE obra_id = ? AND form_key = ?',
      [obraId, formKey]
    );
    if (rows.length === 0)
      return res.json({ success: true, data: null });
    res.json({ success: true, data: { ...rows[0].datos, _meta: { fechaActualizacion: rows[0].fecha_actualizacion } } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const saveFormulario = async (req, res) => {
  try {
    const { obraId, formKey } = req.params;
    const datos = req.body;

    await pool.query(
      `INSERT INTO formularios (obra_id, form_key, datos, actualizado_por)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         datos = JSON_MERGE_PATCH(datos, VALUES(datos)),
         actualizado_por = VALUES(actualizado_por),
         fecha_actualizacion = CURRENT_TIMESTAMP`,
      [obraId, formKey, JSON.stringify(datos), req.user.id]
    );

    res.json({ success: true, message: `Formulario '${formKey}' guardado` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getAll, getFormulario, saveFormulario };
