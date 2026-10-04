const express = require('express');
const bookingController = require('../controllers/booking.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireRole('customer'), bookingController.create);
router.get('/mine', requireRole('customer'), bookingController.mine);
router.patch('/:id/cancel', requireRole('customer'), bookingController.cancel);

module.exports = router;