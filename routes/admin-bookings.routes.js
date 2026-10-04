const express = require('express');
const bookingController = require('../controllers/booking.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireRole('staff', 'admin'));

router.get('/fields', bookingController.adminFields);
router.get('/', bookingController.adminList);
router.patch('/:id/status', bookingController.updateStatus);
router.post('/:id/payments', bookingController.recordPayment);

module.exports = router;
