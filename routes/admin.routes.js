const express = require('express');
const adminController = require('../controllers/admin.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireRole('admin'));

router.get('/sport-types', adminController.getSportTypes);
router.post('/sport-types', adminController.createSportType);
router.put('/sport-types/:id', adminController.updateSportType);
router.delete('/sport-types/:id', adminController.deleteSportType);

router.get('/fields', adminController.getFields);
router.post('/fields', adminController.createField);
router.put('/fields/:id', adminController.updateField);
router.patch('/fields/:id/status', adminController.toggleFieldStatus);
router.delete('/fields/:id', adminController.deleteField);

router.get('/price-rules', adminController.getPriceRules);
router.post('/price-rules', adminController.createPriceRule);
router.put('/price-rules/:id', adminController.updatePriceRule);
router.delete('/price-rules/:id', adminController.deletePriceRule);

module.exports = router;
