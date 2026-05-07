const fs = require('fs');
const documentosService = require('../services/documentosService');

const getAll = async (req, res, next) => {
  try {
    const data = await documentosService.getAll(req.params.obraId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const upload = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
    const data = await documentosService.insertMany(req.params.obraId, req.files, req.user.id);
    res.status(201).json({ success: true, data, message: `${data.length} archivo(s) subido(s)` });
  } catch (err) { next(err); }
};

const descargar = async (req, res, next) => {
  try {
    const doc = await documentosService.getById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Documento no encontrado' });

    if (req.user.rol !== 'admin' && doc.obra_id !== req.user.obra_id)
      return res.status(403).json({ success: false, error: 'Sin permiso para descargar este documento' });

    const filePath = documentosService.getFilePath(doc.nombre_archivo);
    if (!fs.existsSync(filePath))
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco' });

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.nombre_original)}"`);
    res.setHeader('Content-Type', doc.mime_type);
    res.sendFile(filePath);
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const doc = await documentosService.getById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Documento no encontrado' });

    const esAdmin = req.user.rol === 'admin';
    const esPropietario = doc.subido_por === req.user.id;
    const esDesuObra = doc.obra_id === req.user.obra_id;

    if (!esAdmin && !esPropietario && !esDesuObra)
      return res.status(403).json({ success: false, error: 'Sin permiso para eliminar este documento' });

    await documentosService.remove(req.params.id);
    res.json({ success: true, message: 'Documento eliminado' });
  } catch (err) { next(err); }
};

module.exports = { getAll, upload, descargar, remove };
