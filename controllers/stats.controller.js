const statsService = require('../services/stats.service');

async function getMonthlyStats(req, res, next) {
  try {
    const stats = await statsService.getMonthlyStats(req.query.month);
    res.json({ ok: true, data: stats });
  } catch (error) {
    next(error);
  }
}

module.exports = { getMonthlyStats };
