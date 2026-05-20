const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3, BUCKET_NAME } = require('../helpers/s3');
const { ALLOWED_MIME } = require('../helpers/upload');
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

// Returns a presigned PUT URL so the frontend can upload directly to the bucket
const presignedUpload = async (req, res, next) => {
  try {
    const { filename, mimetype, tamano } = req.body;

    if (!filename || !mimetype)
      return res.status(400).json({ success: false, error: 'filename y mimetype son requeridos' });

    if (!ALLOWED_MIME.has(mimetype))
      return res.status(400).json({ success: false, error: 'Tipo de archivo no permitido. Solo PDF, Word y Excel.' });

    if (tamano && tamano > 10 * 1024 * 1024)
      return res.status(400).json({ success: false, error: 'Archivo demasiado grande. Máximo 10 MB.' });

    const ts = Date.now();
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `documentos/${ts}_${safe}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: mimetype,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 min

    res.json({
      success: true,
      data: { uploadUrl, key, expiresIn: 900 }
    });
  } catch (err) { next(err); }
};

// Confirms a direct (client-side) upload and saves metadata to DB
const confirmUpload = async (req, res, next) => {
  try {
    const { key, filename, mimetype, tamano } = req.body;

    if (!key || !filename || !mimetype)
      return res.status(400).json({ success: false, error: 'key, filename y mimetype son requeridos' });

    if (!key.startsWith('documentos/'))
      return res.status(400).json({ success: false, error: 'key inválido' });

    const values = [[req.params.obraId, filename, key, mimetype, tamano || 0, req.user.id]];
    const [result] = await require('../helpers/db').query(
      `INSERT INTO documentos (obra_id, nombre_original, nombre_archivo, mime_type, tamano, subido_por) VALUES ?`,
      [values]
    );

    res.status(201).json({
      success: true,
      data: { id: result.insertId, nombre_original: filename, nombre_archivo: key, mime_type: mimetype, tamano: tamano || 0 },
      message: 'Documento registrado'
    });
  } catch (err) { next(err); }
};

const descargar = async (req, res, next) => {
  try {
    const doc = await documentosService.getById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Documento no encontrado' });

    if (req.user.rol !== 'admin' && doc.obra_id !== req.user.obra_id)
      return res.status(403).json({ success: false, error: 'Sin permiso para descargar este documento' });

    const url = await documentosService.getPresignedDownloadUrl(doc.nombre_archivo, doc.nombre_original);
    res.json({ success: true, data: { url } });
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

module.exports = { getAll, upload, presignedUpload, confirmUpload, descargar, remove };
