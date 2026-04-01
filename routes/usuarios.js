const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const usuariosController = require('../controllers/usuariosController');

// GET /api/usuarios  (admin only)
router.get('/', verifyToken, requireRole('admin'), usuariosController.getAll);

// POST /api/usuarios  (admin only)
router.post('/', verifyToken, requireRole('admin'), usuariosController.create);

// PUT /api/usuarios/:id  (admin only)
router.put('/:id', verifyToken, requireRole('admin'), usuariosController.update);

// DELETE /api/usuarios/:id  (admin only)
router.delete('/:id', verifyToken, requireRole('admin'), usuariosController.remove);

module.exports = router;
