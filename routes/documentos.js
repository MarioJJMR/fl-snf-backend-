const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { upload } = require('../helpers/upload');
const documentosController = require('../controllers/documentosController');

function handleUploadError(err, req, res, next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: 'Archivo demasiado grande. Máximo 10 MB por archivo.' });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  next();
}

// GET  /api/documentos/:obraId
router.get('/:obraId', verifyToken, documentosController.getAll);

// POST /api/documentos/:obraId  (multipart: campo "archivos", hasta 10 archivos — sube al servidor y luego a S3)
router.post('/:obraId', verifyToken, upload.array('archivos', 10), handleUploadError, documentosController.upload);

// POST /api/documentos/:obraId/presigned-upload  (solicita URL firmada para subir directamente desde el cliente)
router.post('/:obraId/presigned-upload', verifyToken, documentosController.presignedUpload);

// POST /api/documentos/:obraId/confirm-upload  (confirma subida directa y registra en DB)
router.post('/:obraId/confirm-upload', verifyToken, documentosController.confirmUpload);

// GET  /api/documentos/:obraId/descargar/:id  (redirige a URL firmada del bucket)
router.get('/:obraId/descargar/:id', verifyToken, documentosController.descargar);

// DELETE /api/documentos/:id
router.delete('/:id', verifyToken, documentosController.remove);

module.exports = router;
