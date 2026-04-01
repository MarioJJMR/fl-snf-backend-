const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { upload } = require('../helpers/upload');
const documentosController = require('../controllers/documentosController');

// Error handler para multer (tipo/tamaño inválido)
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

// POST /api/documentos/:obraId  (campo multipart: "archivos", hasta 10 archivos)
router.post('/:obraId', verifyToken, upload.array('archivos', 10), handleUploadError, documentosController.upload);

// GET  /api/documentos/:obraId/descargar/:id
router.get('/:obraId/descargar/:id', verifyToken, documentosController.descargar);

// DELETE /api/documentos/:id
router.delete('/:id', verifyToken, documentosController.remove);

module.exports = router;
