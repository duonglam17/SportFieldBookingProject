const { pool } = require('../config/db');

const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'no_show', 'cancelled'];
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)/;

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateMonth(value) {
  if (typeof value !== 'string' || !MONTH_PATTERN.test(value)) {
    throw createError(400, 'Tháng phải đúng định dạng YYYY-MM.');
  }

  const [year, month] = value.split('-').map(Number);
  if (year < 1000 || year > 9999) {
    throw createError(400, 'Năm thống kê phải nằm trong khoảng 1000-9999.');
  }

  return { year, month, value };
}

function parseTimeMinutes(value) {
  const match = typeof value === 'string' ? value.match(TIME_PATTERN) : null;
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function calculateStatistics({ month, payments, bookings, fields, openTime, closeTime }) {
  const { year, month: monthNumber, value: normalizedMonth } = validateMonth(month);
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const revenueByDay = Array.from({ length: dayCount }, (_, index) => ({
    date: formatDate(year, monthNumber, index + 1),
    revenue: 0,
  }));
  const revenueForDay = new Map(revenueByDay.map((day, index) => [day.date, index]));

  payments.forEach((payment) => {
    const dayIndex = revenueForDay.get(payment.date);
    if (dayIndex === undefined) return;

    const amount = Number(payment.amount);
    if (!Number.isFinite(amount)) {
      throw new Error('Dữ liệu khoản thanh toán không hợp lệ khi tính thống kê.');
    }
    if (payment.type === 'deposit' || payment.type === 'balance') {
      revenueByDay[dayIndex].revenue += amount;
    } else if (payment.type === 'refund') {
      if (
        Object.hasOwn(payment, 'recordedBy') &&
        payment.recordedBy === null
      ) {
        return;
      }
      revenueByDay[dayIndex].revenue -= amount;
    }
  });

  const bookingsByStatus = Object.fromEntries(BOOKING_STATUSES.map((status) => [status, 0]));
  const bookingsByFieldMap = new Map(
    fields.map((field) => [Number(field.id), {
      fieldId: Number(field.id),
      fieldName: field.name,
      count: 0,
    }]),
  );
  const openMinute = parseTimeMinutes(openTime);
  const closeMinute = parseTimeMinutes(closeTime);
  if (openMinute === null || closeMinute === null || closeMinute <= openMinute) {
    throw new Error('Cấu hình giờ mở cửa không hợp lệ khi tính thống kê.');
  }

  const bookingsByHour = [];
  for (let slotStart = openMinute; slotStart < closeMinute; slotStart += 60) {
    const slotEnd = Math.min(slotStart + 60, closeMinute);
    const hourLabel = (minute) =>
      `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    bookingsByHour.push({
      start: hourLabel(slotStart),
      end: hourLabel(slotEnd),
      count: 0,
    });
  }

  bookings.forEach((booking) => {
    if (Object.hasOwn(bookingsByStatus, booking.status)) {
      bookingsByStatus[booking.status] += 1;
    }
    const field = bookingsByFieldMap.get(Number(booking.fieldId));
    if (field) field.count += 1;

    if (booking.status === 'cancelled' || booking.expiredPending) return;
    const startMinute = parseTimeMinutes(booking.start);
    const endMinute = parseTimeMinutes(booking.end);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      throw new Error('Dữ liệu khung giờ đặt sân không hợp lệ khi tính thống kê.');
    }

    bookingsByHour.forEach((slot) => {
      const slotStart = parseTimeMinutes(slot.start);
      const slotEnd = parseTimeMinutes(slot.end);
      if (startMinute < slotEnd && endMinute > slotStart) slot.count += 1;
    });
  });

  const totalBookings = Object.values(bookingsByStatus).reduce((sum, count) => sum + count, 0);
  const noShowCount = bookingsByStatus.no_show;
  const bookingCountByHour = bookingsByHour.slice();
  const topTimeSlots = bookingCountByHour
    .filter((slot) => slot.count > 0)
    .sort((left, right) => right.count - left.count || left.start.localeCompare(right.start))
    .slice(0, 5);

  return {
    month: normalizedMonth,
    summary: {
      totalRevenue: revenueByDay.reduce((sum, day) => sum + day.revenue, 0),
      bookingCount: totalBookings,
      noShowCount,
      noShowRate: totalBookings === 0 ? 0 : noShowCount / totalBookings,
    },
    revenueByDay,
    bookingsByStatus,
    topTimeSlots,
    bookingsByHour: bookingCountByHour,
    bookingsByField: [...bookingsByFieldMap.values()].sort(
      (left, right) => left.fieldName.localeCompare(right.fieldName, 'vi'),
    ),
  };
}

async function getMonthlyStats(month) {
  const { year, month: monthNumber, value } = validateMonth(month);
  const startDate = `${value}-01`;
  const nextMonthDate =
    monthNumber === 12
      ? `${String(year + 1).padStart(4, '0')}-01-01`
      : `${String(year).padStart(4, '0')}-${String(monthNumber + 1).padStart(2, '0')}-01`;

  const [paymentRows, bookingRows, fieldRows] = await Promise.all([
    pool.execute(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
              type,
              SUM(
                CASE WHEN type = 'refund' AND recorded_by IS NULL THEN 0 ELSE amount END
              ) AS amount
       FROM payments
       WHERE created_at >= ? AND created_at < ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d'), type
       ORDER BY date, type`,
      [startDate, nextMonthDate],
    ),
    pool.execute(
      `SELECT b.field_id AS fieldId,
              b.status,
              TIME_FORMAT(b.start_time, '%H:%i') AS start,
              TIME_FORMAT(b.end_time, '%H:%i') AS end,
              (b.status = 'pending' AND (b.expires_at IS NULL OR b.expires_at <= NOW()))
                AS expiredPending
       FROM bookings b
       WHERE b.booking_date >= ? AND b.booking_date < ?
       ORDER BY b.booking_date, b.start_time, b.id`,
      [startDate, nextMonthDate],
    ),
    pool.execute('SELECT id, name FROM fields ORDER BY name, id'),
  ]);

  return calculateStatistics({
    month: value,
    payments: paymentRows[0],
    bookings: bookingRows[0],
    fields: fieldRows[0],
    openTime: process.env.OPEN_TIME || '06:00',
    closeTime: process.env.CLOSE_TIME || '22:00',
  });
}

module.exports = { getMonthlyStats, calculateStatistics, validateMonth };
