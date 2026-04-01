const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const obrasController = require('../controllers/obrasController');

// GET /api/obras
router.get('/', verifyToken, obrasController.getAll);

// GET /api/obras/:id
router.get('/:id', verifyToken, obrasController.getById);

// POST /api/obras  (admin only)
router.post('/', verifyToken, requireRole('admin'), obrasController.create);

// PUT /api/obras/:id
router.put('/:id', verifyToken, obrasController.update);

// DELETE /api/obras/:id  (admin only)
router.delete('/:id', verifyToken, requireRole('admin'), obrasController.remove);

module.exports = router;
