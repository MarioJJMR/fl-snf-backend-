const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const formulariosController = require('../controllers/formulariosController');

// GET /api/formularios/:obraId
router.get('/:obraId', verifyToken, formulariosController.getAll);

// GET /api/formularios/:obraId/:formKey
router.get('/:obraId/:formKey', verifyToken, formulariosController.getFormulario);

// POST /api/formularios/:obraId/:formKey
router.post('/:obraId/:formKey', verifyToken, formulariosController.saveFormulario);

module.exports = router;
