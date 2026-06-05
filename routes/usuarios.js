const express = require('express');
const router = express.Router();
const { verifyToken, requireRole, requireObraAccess } = require('../middleware/auth');
const usuariosController = require('../controllers/usuariosController');

// GET /api/usuarios  (admin only)
router.get('/', verifyToken, requireRole('admin'), usuariosController.getAll);

// GET /api/usuarios/obra/:obraId  (obra user or admin)
router.get('/obra/:obraId', verifyToken, requireObraAccess('obraId'), usuariosController.getByObra);

// POST /api/usuarios  (admin only)
router.post('/', verifyToken, requireRole('admin'), usuariosController.create);

// PUT /api/usuarios/:id  (admin only)
router.put('/:id', verifyToken, requireRole('admin'), usuariosController.update);

// DELETE /api/usuarios/:id  (admin only)
router.delete('/:id', verifyToken, requireRole('admin'), usuariosController.remove);

module.exports = router;
