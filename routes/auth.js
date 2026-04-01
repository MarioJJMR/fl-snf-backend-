const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const authController = require('../controllers/authController');

// POST /api/auth/login
router.post('/login', authController.login);

// POST /api/auth/logout
router.post('/logout', verifyToken, authController.logout);

// GET /api/auth/me
router.get('/me', verifyToken, authController.me);

module.exports = router;
