const blockedSlotsService = require('../services/blocked-slots.service');

async function list(req, res, next) {
  try {
    const blockedSlots = await blockedSlotsService.getBlockedSlots(req.query);
    res.json({ ok: true, data: blockedSlots });
  } catch (error) {
    next(error);
  }
}

async function fields(req, res, next) {
  try {
    const bookingService = require('../services/booking.service');
    const fields = await bookingService.getAdminBookingFields();
    res.json({ ok: true, data: fields });
  } catch (error) {
    next(error);
  }
}

async function schedule(req, res, next) {
  try {
    const result = await blockedSlotsService.getDailySchedule(req.query.date);
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const blockedSlot = await blockedSlotsService.createBlockedSlot(
      req.session.userId,
      req.body || {},
    );
    res.status(201).json({ ok: true, data: blockedSlot });
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const result = await blockedSlotsService.deleteBlockedSlot(req.params.id);
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, fields, schedule, create, remove };
