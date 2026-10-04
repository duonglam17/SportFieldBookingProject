const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireLogin } = require('../middleware/auth');
const createLoginRateLimiter = require('../middleware/loginRateLimit');

const router = express.Router();
const loginRateLimit = createLoginRateLimiter({
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 900000),
  maxFailures: Number(process.env.LOGIN_RATE_LIMIT_MAX_FAILURES || 10),
});

router.post('/register', authController.register);
router.post('/login', loginRateLimit, authController.login);
router.post('/logout', requireLogin, authController.logout);
router.get('/me', requireLogin, authController.me);

module.exports = router;