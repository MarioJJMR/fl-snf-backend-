const express = require('express');
const router = express.Router();
const { verifyToken, requireObraAccess } = require('../middleware/auth');
const notificacionesController = require('../controllers/notificacionesController');

// GET /api/notificaciones/obra/:obraId
router.get('/obra/:obraId', verifyToken, requireObraAccess(), notificacionesController.getByObra);

// POST /api/notificaciones/obra/:obraId/leer
router.post('/obra/:obraId/leer', verifyToken, requireObraAccess(), notificacionesController.marcarLeidas);

module.exports = router;
