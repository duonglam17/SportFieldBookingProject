const { pool, withTransaction } = require('../config/db');

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function createError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, `${label} phải là số nguyên dương.`);
  }
  return parsed;
}

function parseDate(value) {
  const match = typeof value === 'string' ? value.match(DATE_PATTERN) : null;
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, timestamp: parsed.getTime() };
}

function parseTime(value) {
  const match = typeof value === 'string' ? value.match(TIME_PATTERN) : null;
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function validateBlockedRange(date, start, end) {
  const parsedDate = parseDate(date);
  if (!parsedDate) {
    throw createError(400, 'Ngày phải đúng định dạng YYYY-MM-DD và là ngày hợp lệ.');
  }
  if (date < localDate()) {
    throw createError(400, 'Không thể tạo khóa sân cho ngày đã qua.');
  }

  const startMinutes = parseTime(start);
  const endMinutes = parseTime(end);
  if (startMinutes === null) {
    throw createError(400, 'Giờ bắt đầu phải đúng định dạng HH:MM.');
  }
  if (endMinutes === null) {
    throw createError(400, 'Giờ kết thúc phải đúng định dạng HH:MM.');
  }
  if (endMinutes <= startMinutes) {
    throw createError(400, 'Giờ kết thúc phải sau giờ bắt đầu trong cùng một ngày.');
  }
  if (startMinutes % 60 !== 0 || endMinutes % 60 !== 0) {
    throw createError(400, 'Giờ khóa sân phải bắt đầu và kết thúc đúng giờ chẵn.');
  }

  const openTime = parseTime(process.env.OPEN_TIME || '06:00');
  const closeTime = parseTime(process.env.CLOSE_TIME || '22:00');
  if (openTime === null || closeTime === null || openTime >= closeTime) {
    throw new Error('Cấu hình OPEN_TIME hoặc CLOSE_TIME không hợp lệ.');
  }
  if (startMinutes < openTime || endMinutes > closeTime) {
    throw createError(
      400,
      `Khung giờ khóa phải nằm trong giờ mở cửa ${process.env.OPEN_TIME || '06:00'}-${
        process.env.CLOSE_TIME || '22:00'
      }.`,
    );
  }

  return true;
}

async function getBlockedSlots({ date, fieldId } = {}) {
  const conditions = [];
  const params = [];
  if (date) {
    if (!parseDate(date)) {
      throw createError(400, 'Ngày lọc phải đúng định dạng YYYY-MM-DD.');
    }
    conditions.push('bs.block_date = ?');
    params.push(date);
  } else {
    conditions.push('bs.block_date >= CURDATE()');
  }
  if (fieldId !== undefined && fieldId !== '') {
    conditions.push('bs.field_id = ?');
    params.push(parsePositiveInteger(fieldId, 'ID sân'));
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `SELECT bs.id, bs.field_id AS fieldId, f.name AS fieldName,
            DATE_FORMAT(bs.block_date, '%Y-%m-%d') AS date,
            TIME_FORMAT(bs.start_time, '%H:%i') AS start,
            TIME_FORMAT(bs.end_time, '%H:%i') AS end,
            bs.reason, bs.created_by AS createdBy, u.full_name AS creatorName
     FROM blocked_slots bs
     INNER JOIN fields f ON f.id = bs.field_id
     LEFT JOIN users u ON u.id = bs.created_by
     ${where}
     ORDER BY bs.block_date, bs.start_time, bs.id`,
    params,
  );
  return rows;
}

async function getDailySchedule(date) {
  if (!parseDate(date)) {
    throw createError(400, 'Ngày phải đúng định dạng YYYY-MM-DD và là ngày hợp lệ.');
  }

  const [fields] = await pool.execute(
    `SELECT id, name, status
     FROM fields
     ORDER BY name, id`,
  );
  const [bookings] = await pool.execute(
    `SELECT b.field_id AS fieldId, f.name AS fieldName,
            u.full_name AS customerName,
            TIME_FORMAT(b.start_time, '%H:%i') AS start,
            TIME_FORMAT(b.end_time, '%H:%i') AS end,
            'booked' AS type
     FROM bookings b
     INNER JOIN fields f ON f.id = b.field_id
     INNER JOIN users u ON u.id = b.user_id
     WHERE b.booking_date = ?
       AND (
         b.status = 'confirmed'
         OR (b.status = 'pending' AND b.expires_at > NOW())
       )
     ORDER BY b.field_id, b.start_time`,
    [date],
  );
  const [blockedSlots] = await pool.execute(
    `SELECT bs.field_id AS fieldId, f.name AS fieldName,
            NULL AS customerName, bs.reason,
            TIME_FORMAT(bs.start_time, '%H:%i') AS start,
            TIME_FORMAT(bs.end_time, '%H:%i') AS end,
            'blocked' AS type
     FROM blocked_slots bs
     INNER JOIN fields f ON f.id = bs.field_id
     WHERE bs.block_date = ?
     ORDER BY bs.field_id, bs.start_time`,
    [date],
  );

  return { fields, intervals: [...bookings, ...blockedSlots] };
}

async function createBlockedSlot(staffId, input = {}) {
  const fieldId = parsePositiveInteger(input.fieldId, 'ID sân');
  const date = input.date;
  const start = input.start;
  const end = input.end;
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length > 255) {
    throw createError(400, 'Lý do khóa sân tối đa 255 ký tự.');
  }
  validateBlockedRange(date, start, end);

  return withTransaction(async (connection) => {
    const [fieldRows] = await connection.execute(
      'SELECT id, name FROM fields WHERE id = ? FOR UPDATE',
      [fieldId],
    );
    if (fieldRows.length === 0) {
      throw createError(404, 'Sân không tồn tại.');
    }

    const [conflicts] = await connection.execute(
      `SELECT b.id AS bookingId, b.user_id AS userId, u.full_name AS customerName,
              b.status, DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS date,
              TIME_FORMAT(b.start_time, '%H:%i') AS start,
              TIME_FORMAT(b.end_time, '%H:%i') AS end
       FROM bookings b
       INNER JOIN users u ON u.id = b.user_id
       WHERE b.field_id = ?
         AND b.booking_date = ?
         AND b.start_time < ?
         AND b.end_time > ?
         AND (
           b.status = 'confirmed'
           OR (b.status = 'pending' AND b.expires_at > NOW())
         )
       ORDER BY b.start_time, b.id
       FOR UPDATE`,
      [fieldId, date, end, start],
    );

    if (conflicts.length > 0) {
      throw createError(
        409,
        'Không thể khóa sân vì khung giờ đang trùng với lượt đặt còn hiệu lực. Hãy xử lý các lượt đặt xung đột trước.',
        { conflicts },
      );
    }

    const [result] = await connection.execute(
      `INSERT INTO blocked_slots (field_id, block_date, start_time, end_time, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fieldId, date, start, end, reason || null, staffId],
    );

    return {
      id: result.insertId,
      fieldId,
      fieldName: fieldRows[0].name,
      date,
      start,
      end,
      reason: reason || null,
      createdBy: staffId,
    };
  });
}

async function deleteBlockedSlot(slotId) {
  const id = parsePositiveInteger(slotId, 'ID khóa sân');
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      'SELECT id, field_id FROM blocked_slots WHERE id = ? FOR UPDATE',
      [id],
    );
    if (rows.length === 0) {
      throw createError(404, 'Không tìm thấy khung giờ bị khóa.');
    }

    const [fieldRows] = await connection.execute(
      'SELECT id FROM fields WHERE id = ? FOR UPDATE',
      [rows[0].field_id],
    );
    if (fieldRows.length === 0) {
      throw createError(404, 'Sân của khung giờ khóa không còn tồn tại.');
    }

    await connection.execute('DELETE FROM blocked_slots WHERE id = ?', [id]);
    return { id, message: 'Đã mở khóa sân thành công.' };
  });
}

module.exports = {
  getBlockedSlots,
  getDailySchedule,
  createBlockedSlot,
  deleteBlockedSlot,
  validateBlockedRange,
};
