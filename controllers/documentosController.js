const path = require('path');
const fs = require('fs');
const pool = require('../helpers/db');
const { UPLOADS_DIR } = require('../helpers/upload');

// GET /api/documentos/:obraId
const getAll = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nombre_original, nombre_archivo, mime_type, tamano, subido_por, fecha_subida
       FROM documentos WHERE obra_id = ? ORDER BY fecha_subida DESC`,
      [req.params.obraId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/documentos/:obraId  (multipart/form-data, campo "archivos")
const upload = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
    }

    const { obraId } = req.params;
    const insertados = [];

    for (const file of req.files) {
      const [result] = await pool.query(
        `INSERT INTO documentos (obra_id, nombre_original, nombre_archivo, mime_type, tamano, subido_por)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [obraId, file.originalname, file.filename, file.mimetype, file.size, req.user.id]
      );
      insertados.push({
        id: result.insertId,
        nombre_original: file.originalname,
        nombre_archivo: file.filename,
        mime_type: file.mimetype,
        tamano: file.size
      });
    }

    res.status(201).json({ success: true, data: insertados, message: `${insertados.length} archivo(s) subido(s)` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/documentos/:obraId/descargar/:id
const descargar = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT nombre_original, nombre_archivo, mime_type, obra_id FROM documentos WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Documento no encontrado' });
    }

    const doc = rows[0];
    // Usuarios solo pueden descargar documentos de su propia obra
    if (req.user.rol !== 'admin' && doc.obra_id !== req.user.obra_id) {
      return res.status(403).json({ success: false, error: 'Sin permiso para descargar este documento' });
    }

    const filePath = path.join(UPLOADS_DIR, doc.nombre_archivo);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.nombre_original)}"`);
    res.setHeader('Content-Type', doc.mime_type);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/documentos/:id
const remove = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT nombre_archivo, obra_id, subido_por FROM documentos WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Documento no encontrado' });
    }

    const doc = rows[0];
    const esAdmin = req.user.rol === 'admin';
    const esPropietario = doc.subido_por === req.user.id;
    const esDesuObra = doc.obra_id === req.user.obra_id;

    if (!esAdmin && !esPropietario && !esDesuObra) {
      return res.status(403).json({ success: false, error: 'Sin permiso para eliminar este documento' });
    }

    // Borrar registro de BD
    await pool.query('DELETE FROM documentos WHERE id = ?', [req.params.id]);

    // Borrar archivo de disco (si existe)
    const filePath = path.join(UPLOADS_DIR, doc.nombre_archivo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ success: true, message: 'Documento eliminado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getAll, upload, descargar, remove };
