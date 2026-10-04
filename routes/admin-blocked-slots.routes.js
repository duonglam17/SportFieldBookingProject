const express = require('express');
const blockedSlotsController = require('../controllers/blocked-slots.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireRole('staff', 'admin'));

router.get('/fields', blockedSlotsController.fields);
router.get('/schedule', blockedSlotsController.schedule);
router.get('/', blockedSlotsController.list);
router.post('/', blockedSlotsController.create);
router.delete('/:id', blockedSlotsController.remove);

module.exports = router;
