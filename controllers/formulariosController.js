const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3, BUCKET_NAME } = require('../helpers/s3');
const pool = require('../helpers/db');
const logger = require('../helpers/logger');

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
    logger.info(`[formularios] POST /${obraId}/${formKey} — user=${req.user?.id} hasFile=${!!req.file}`);

    // Support both JSON body and multipart/form-data (when a file is included)
    let datos = req.file ? JSON.parse(req.body.datos || '{}') : req.body;

    const [obra] = await pool.query('SELECT id FROM obras WHERE id = ?', [obraId]);
    if (obra.length === 0) {
      logger.warn(`[formularios] obra not found: ${obraId}`);
      return res.status(404).json({ success: false, error: `Obra con id '${obraId}' no encontrada` });
    }

    // If a file was uploaded, push it to S3 and store the reference in datos
    if (req.file) {
      const ts = Date.now();
      const safe = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `formularios/${obraId}/${formKey}/${ts}_${safe}`;

      logger.info(`[formularios] uploading file to S3 — key=${key} mimetype=${req.file.mimetype} size=${req.file.size}`);

      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));

      logger.info(`[formularios] S3 upload success — key=${key}`);

      datos._archivo = {
        key,
        nombre: req.file.originalname,
        mimetype: req.file.mimetype,
        tamano: req.file.size,
      };
    }

    await pool.query(
      `INSERT INTO formularios (obra_id, form_key, datos, actualizado_por)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         datos = JSON_MERGE_PATCH(datos, VALUES(datos)),
         actualizado_por = VALUES(actualizado_por),
         fecha_actualizacion = CURRENT_TIMESTAMP`,
      [obraId, formKey, JSON.stringify(datos), req.user.id]
    );

    logger.info(`[formularios] saved — obraId=${obraId} formKey=${formKey}`);
    res.json({ success: true, message: `Formulario '${formKey}' guardado` });
  } catch (err) {
    logger.error(`[formularios] POST /${req.params.obraId}/${req.params.formKey} error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getAll, getFormulario, saveFormulario };
