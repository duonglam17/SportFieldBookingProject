const { pool } = require('../config/db');

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parseDate(date) {
  if (typeof date !== 'string') {
    return null;
  }

  const match = date.match(DATE_PATTERN);
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, timestamp };
}

function parseTime(time) {
  if (typeof time !== 'string') {
    return null;
  }

  const match = time.match(TIME_PATTERN);
  if (!match) {
    return null;
  }

  const [, hourText, minuteText] = match;
  return {
    hour: Number(hourText),
    minute: Number(minuteText),
    minutesFromMidnight: Number(hourText) * 60 + Number(minuteText),
  };
}

function getServerDateParts(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return {
    date: `${year}-${month}-${day}`,
    year,
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

function readOpeningHours() {
  const openTimeText = process.env.OPEN_TIME || '06:00';
  const closeTimeText = process.env.CLOSE_TIME || '22:00';
  const openTime = parseTime(openTimeText);
  const closeTime = parseTime(closeTimeText);

  if (!openTime || !closeTime || openTime.minutesFromMidnight >= closeTime.minutesFromMidnight) {
    throw new Error('Cấu hình OPEN_TIME hoặc CLOSE_TIME không hợp lệ.');
  }

  return { openTimeText, closeTimeText, openTime, closeTime };
}

function validateDateOnly(date) {
  if (!parseDate(date)) {
    throw createValidationError('Ngày phải đúng định dạng YYYY-MM-DD và là ngày hợp lệ.');
  }
}

function validateTimeRange(date, start, end) {
  const parsedDate = parseDate(date);
  if (!parsedDate) {
    throw createValidationError('Ngày phải đúng định dạng YYYY-MM-DD và là ngày hợp lệ.');
  }

  const parsedStart = parseTime(start);
  if (!parsedStart) {
    throw createValidationError('Giờ bắt đầu phải đúng định dạng HH:MM.');
  }

  const parsedEnd = parseTime(end);
  if (!parsedEnd) {
    throw createValidationError('Giờ kết thúc phải đúng định dạng HH:MM.');
  }

  if (parsedEnd.minutesFromMidnight <= parsedStart.minutesFromMidnight) {
    throw createValidationError('Giờ kết thúc phải sau giờ bắt đầu trong cùng một ngày.');
  }

  if (parsedStart.minute !== 0 || parsedEnd.minute !== 0) {
    throw createValidationError('Giờ bắt đầu và kết thúc phải đúng giờ chẵn, ví dụ 18:00.');
  }

  const { openTimeText, closeTimeText, openTime, closeTime } = readOpeningHours();
  if (
    parsedStart.minutesFromMidnight < openTime.minutesFromMidnight ||
    parsedEnd.minutesFromMidnight > closeTime.minutesFromMidnight
  ) {
    throw createValidationError(`Khung giờ phải nằm trong giờ mở cửa ${openTimeText}-${closeTimeText}.`);
  }

  const serverDate = getServerDateParts();
  const serverDateTimestamp = Date.UTC(serverDate.year, serverDate.month - 1, serverDate.day);
  const daysAhead = (parsedDate.timestamp - serverDateTimestamp) / 86400000;

  if (daysAhead < 0) {
    throw createValidationError('Không thể đặt sân vào ngày đã qua.');
  }

  const maxDaysAhead = Number(process.env.MAX_DAYS_AHEAD || 30);
  if (!Number.isInteger(maxDaysAhead) || maxDaysAhead < 0) {
    throw new Error('Cấu hình MAX_DAYS_AHEAD phải là số nguyên không âm.');
  }

  if (daysAhead > maxDaysAhead) {
    throw createValidationError(`Chỉ được đặt sân trước tối đa ${maxDaysAhead} ngày.`);
  }

  if (daysAhead === 0) {
    const requestedStart = new Date(
      serverDate.year,
      serverDate.month - 1,
      serverDate.day,
      parsedStart.hour,
      parsedStart.minute,
    );

    if (requestedStart.getTime() <= Date.now()) {
      throw createValidationError('Giờ bắt đầu phải ở trong tương lai.');
    }
  }

  const durationHours =
    (parsedEnd.minutesFromMidnight - parsedStart.minutesFromMidnight) / 60;
  const maxHours = Number(process.env.MAX_HOURS_PER_BOOKING || 3);

  if (!Number.isFinite(maxHours) || maxHours <= 0) {
    throw new Error('Cấu hình MAX_HOURS_PER_BOOKING phải lớn hơn 0.');
  }

  if (durationHours > maxHours) {
    throw createValidationError(`Mỗi lượt đặt không được vượt quá ${maxHours} giờ.`);
  }

  return true;
}

async function isRangeFree(conn, fieldId, date, start, end) {
  const [bookingRows] = await conn.execute(
    `SELECT id
     FROM bookings
     WHERE field_id = ?
       AND booking_date = ?
       AND start_time < ?
       AND end_time > ?
       AND (
         status = 'confirmed'
         OR (status = 'pending' AND expires_at > NOW())
       )
     LIMIT 1`,
    [fieldId, date, end, start],
  );

  if (bookingRows.length > 0) {
    return false;
  }

  const [blockedRows] = await conn.execute(
    `SELECT id
     FROM blocked_slots
     WHERE field_id = ?
       AND block_date = ?
       AND start_time < ?
       AND end_time > ?
     LIMIT 1`,
    [fieldId, date, end, start],
  );

  return blockedRows.length === 0;
}

async function getFieldSchedule(fieldId, date) {
  validateDateOnly(date);

  const [rows] = await pool.execute(
    `SELECT TIME_FORMAT(start_time, '%H:%i') AS start,
            TIME_FORMAT(end_time, '%H:%i') AS end,
            'booked' AS type
     FROM bookings
     WHERE field_id = ?
       AND booking_date = ?
       AND (
         status = 'confirmed'
         OR (status = 'pending' AND expires_at > NOW())
       )
     UNION ALL
     SELECT TIME_FORMAT(start_time, '%H:%i') AS start,
            TIME_FORMAT(end_time, '%H:%i') AS end,
            'blocked' AS type
     FROM blocked_slots
     WHERE field_id = ?
       AND block_date = ?
     ORDER BY start, end`,
    [fieldId, date, fieldId, date],
  );

  return rows;
}

async function findAvailableFields(sportTypeId, date, start, end) {
  validateTimeRange(date, start, end);

  const [rows] = await pool.execute(
    `SELECT f.id, f.name, f.sport_type_id, f.description, f.image_url, f.status
     FROM fields f
     WHERE f.status = 'active'
       AND f.sport_type_id = ?
       AND NOT EXISTS (
         SELECT 1
         FROM bookings b
         WHERE b.field_id = f.id
           AND b.booking_date = ?
           AND b.start_time < ?
           AND b.end_time > ?
           AND (
             b.status = 'confirmed'
             OR (b.status = 'pending' AND b.expires_at > NOW())
           )
       )
       AND NOT EXISTS (
         SELECT 1
         FROM blocked_slots bs
         WHERE bs.field_id = f.id
           AND bs.block_date = ?
           AND bs.start_time < ?
           AND bs.end_time > ?
       )
     ORDER BY f.id`,
    [sportTypeId, date, end, start, date, end, start],
  );

  return rows;
}

module.exports = {
  validateTimeRange,
  isRangeFree,
  getFieldSchedule,
  findAvailableFields,
};
