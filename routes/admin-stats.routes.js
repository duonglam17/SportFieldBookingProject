const express = require('express');
const statsController = require('../controllers/stats.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireRole('admin'));
router.get('/', statsController.getMonthlyStats);

module.exports = router;
