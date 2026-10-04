const bookingService = require('../services/booking.service');

async function create(req, res, next) {
  try {
    const result = await bookingService.createBooking(req.session.userId, req.body || {});
    res.status(201).json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function mine(req, res, next) {
  try {
    const bookings = await bookingService.getMyBookings(req.session.userId);
    res.json({ ok: true, data: bookings });
  } catch (error) {
    next(error);
  }
}

async function cancel(req, res, next) {
  try {
    const result = await bookingService.cancelBooking(req.session.userId, req.params.id);
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function adminList(req, res, next) {
  try {
    const bookings = await bookingService.getAdminBookings(req.query);
    res.json({ ok: true, data: bookings });
  } catch (error) {
    next(error);
  }
}

async function adminFields(req, res, next) {
  try {
    const fields = await bookingService.getAdminBookingFields();
    res.json({ ok: true, data: fields });
  } catch (error) {
    next(error);
  }
}

async function updateStatus(req, res, next) {
  try {
    const result = await bookingService.updateBookingStatus(req.params.id, req.body?.status);
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function recordPayment(req, res, next) {
  try {
    const result = await bookingService.recordBookingPayment(
      req.params.id,
      req.session.userId,
      req.body || {},
    );
    res.status(201).json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = { create, mine, cancel, adminList, adminFields, updateStatus, recordPayment };
