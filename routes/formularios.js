const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { upload } = require('../helpers/upload');
const formulariosController = require('../controllers/formulariosController');

// GET /api/formularios/:obraId
router.get('/:obraId', verifyToken, formulariosController.getAll);

// GET /api/formularios/:obraId/:formKey
router.get('/:obraId/:formKey', verifyToken, formulariosController.getFormulario);

// POST /api/formularios/:obraId/:formKey
// Accepts JSON body OR multipart/form-data with optional file field "archivo"
router.post('/:obraId/:formKey', verifyToken, upload.single('archivo'), formulariosController.saveFormulario);

module.exports = router;
