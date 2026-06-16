const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const correoController = require('../controllers/correoController');

// POST /api/correo/sondeo
router.post('/sondeo', verifyToken, correoController.sondeo);

// POST /api/correo/soporte
router.post('/soporte', verifyToken, correoController.soporte);

// POST /api/correo/notificacion  (solo admin)
router.post('/notificacion', verifyToken, requireRole('admin'), correoController.notificacion);

// GET /api/correo/notificaciones  (solo admin)
router.get('/notificaciones', verifyToken, requireRole('admin'), correoController.getNotificaciones);

module.exports = router;
