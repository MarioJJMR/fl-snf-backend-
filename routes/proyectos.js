const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const proyectosController = require('../controllers/proyectosController');

// GET /api/proyectos/:obraId
router.get('/:obraId', verifyToken, proyectosController.getAll);

// GET /api/proyectos/:obraId/:tipo  ('vigente' | 'financiar')
router.get('/:obraId/:tipo', verifyToken, proyectosController.getByTipo);

// POST /api/proyectos/:obraId/:tipo
router.post('/:obraId/:tipo', verifyToken, proyectosController.create);

// PUT /api/proyectos/:id
router.put('/:id', verifyToken, proyectosController.update);

// DELETE /api/proyectos/:id
router.delete('/:id', verifyToken, proyectosController.remove);

module.exports = router;
