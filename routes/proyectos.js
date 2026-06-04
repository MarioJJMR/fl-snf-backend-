const express = require('express');
const router = express.Router();
const { verifyToken, requireObraAccess } = require('../middleware/auth');
const proyectosController = require('../controllers/proyectosController');

// GET /api/proyectos/:obraId
router.get('/:obraId', verifyToken, requireObraAccess('obraId'), proyectosController.getAll);

// GET /api/proyectos/:obraId/:tipo  ('vigente' | 'financiar')
router.get('/:obraId/:tipo', verifyToken, requireObraAccess('obraId'), proyectosController.getByTipo);

// POST /api/proyectos/:obraId/:tipo
router.post('/:obraId/:tipo', verifyToken, requireObraAccess('obraId'), proyectosController.create);

// PUT /api/proyectos/:id
router.put('/:id', verifyToken, proyectosController.update);

// PATCH /api/proyectos/:id/status
router.patch('/:id/status', verifyToken, proyectosController.updateStatus);

// DELETE /api/proyectos/:id
router.delete('/:id', verifyToken, proyectosController.remove);

module.exports = router;
