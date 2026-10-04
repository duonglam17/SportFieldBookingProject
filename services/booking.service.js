const { pool, withTransaction } = require('../config/db');
const { validateTimeRange, isRangeFree } = require('./availability.service');
const { calculatePrice, calculateDeposit } = require('./pricing.service');

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, `${label} phải là số nguyên dương.`);
  }
  return parsed;
}

function getConfigInteger(key, fallback, minimum = 0) {
  const value = Number(process.env[key] || fallback);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`Cấu hình ${key} không hợp lệ.`);
  }
  return value;
}

async function createBooking(userId, { fieldId, date, start, end, note }) {
  const customerId = parsePositiveInteger(userId, 'ID khách hàng');
  const targetFieldId = parsePositiveInteger(fieldId, 'ID sân');
  validateTimeRange(date, start, end);

  const holdMinutes = getConfigInteger('HOLD_MINUTES', 30, 1);
  const bookingNote = typeof note === 'string' ? note.trim() : '';
  if (bookingNote.length > 255) {
    throw createError(400, 'Ghi chú không được vượt quá 255 ký tự.');
  }

  return withTransaction(async (connection) => {
    const [fieldRows] = await connection.execute(
      'SELECT id, sport_type_id, status FROM fields WHERE id = ? FOR UPDATE',
      [targetFieldId],
    );
    const field = fieldRows[0];

    if (!field) {
      throw createError(404, 'Sân không tồn tại.');
    }
    if (field.status !== 'active') {
      throw createError(409, 'Sân hiện không hoạt động.');
    }

    const rangeFree = await isRangeFree(connection, targetFieldId, date, start, end);
    if (!rangeFree) {
      throw createError(409, 'Khung giờ vừa được đặt hoặc bị khóa. Vui lòng chọn khung giờ khác.');
    }

    const price = await calculatePrice(field.sport_type_id, date, start, end, connection);
    const [result] = await connection.execute(
      `INSERT INTO bookings
         (user_id, field_id, booking_date, start_time, end_time, total_price,
          status, payment_status, note, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 'unpaid', ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [
        customerId,
        targetFieldId,
        date,
        start,
        end,
        price.totalPrice,
        bookingNote || null,
        holdMinutes,
      ],
    );

    const [createdRows] = await connection.execute(
      `SELECT id, user_id AS userId, field_id AS fieldId,
              DATE_FORMAT(booking_date, '%Y-%m-%d') AS date,
              TIME_FORMAT(start_time, '%H:%i') AS start,
              TIME_FORMAT(end_time, '%H:%i') AS end,
              CAST(total_price AS UNSIGNED) AS totalPrice, status,
              payment_status AS paymentStatus,
              note, DATE_FORMAT(expires_at, '%Y-%m-%d %H:%i:%s') AS expiresAt
       FROM bookings
       WHERE id = ?`,
      [result.insertId],
    );

    return {
      booking: createdRows[0],
      totalPrice: price.totalPrice,
      depositAmount: calculateDeposit(price.totalPrice),
      transferReference: `SB-${result.insertId}`,
    };
  });
}

async function getMyBookings(userId) {
  const customerId = parsePositiveInteger(userId, 'ID khách hàng');
  const [rows] = await pool.execute(
    `SELECT b.id, b.field_id AS fieldId, f.name AS fieldName,
            st.name AS sportTypeName,
            DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS date,
            TIME_FORMAT(b.start_time, '%H:%i') AS start,
            TIME_FORMAT(b.end_time, '%H:%i') AS end,
            b.total_price AS totalPrice, b.status,
            b.payment_status AS paymentStatus, b.note,
            DATE_FORMAT(b.expires_at, '%Y-%m-%d %H:%i:%s') AS expiresAt,
            GREATEST(TIMESTAMPDIFF(SECOND, NOW(), b.expires_at), 0) AS holdSecondsRemaining,
            GREATEST(
              TIMESTAMPDIFF(SECOND, NOW(), TIMESTAMP(b.booking_date, b.start_time)),
              0
            ) AS secondsUntilStart,
            COALESCE((
              SELECT SUM(p.amount)
              FROM payments p
              WHERE p.booking_id = b.id AND p.type = 'deposit'
            ), 0) AS depositPaid,
            COALESCE((
              SELECT SUM(p.amount)
              FROM payments p
              WHERE p.booking_id = b.id AND p.type = 'refund'
            ), 0) AS refundPending
     FROM bookings b
     INNER JOIN fields f ON f.id = b.field_id
     INNER JOIN sport_types st ON st.id = f.sport_type_id
     WHERE b.user_id = ?
     ORDER BY b.booking_date, b.start_time, b.id`,
    [customerId],
  );
  return rows.map((booking) => ({
    ...booking,
    totalPrice: Number(booking.totalPrice),
    holdSecondsRemaining: Number(booking.holdSecondsRemaining) || 0,
    depositPaid: Number(booking.depositPaid),
    refundPending: Number(booking.refundPending),
    depositAmount: calculateDeposit(Number(booking.totalPrice)),
    transferReference: `SB-${booking.id}`,
  }));
}

async function cancelBooking(userId, bookingId) {
  const customerId = parsePositiveInteger(userId, 'ID khách hàng');
  const targetBookingId = parsePositiveInteger(bookingId, 'ID lượt đặt');
  const cancelBeforeHours = getConfigInteger('CANCEL_BEFORE_HOURS', 2);
  const refundFullBeforeHours = getConfigInteger('REFUND_FULL_BEFORE_HOURS', 24);

  return withTransaction(async (connection) => {
    const [bookingRows] = await connection.execute(
      `SELECT id, user_id, field_id, booking_date, start_time, total_price,
              status, payment_status,
              TIMESTAMPDIFF(
                SECOND,
                NOW(),
                TIMESTAMP(booking_date, start_time)
              ) AS seconds_until_start
       FROM bookings
       WHERE id = ? AND user_id = ?
       FOR UPDATE`,
      [targetBookingId, customerId],
    );
    const booking = bookingRows[0];

    if (!booking) {
      throw createError(404, 'Không tìm thấy lượt đặt của bạn.');
    }
    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw createError(409, 'Chỉ có thể hủy lượt đặt đang pending hoặc confirmed.');
    }

    const minimumCancelSeconds = cancelBeforeHours * 60 * 60;
    if (Number(booking.seconds_until_start) < minimumCancelSeconds) {
      throw createError(
        409,
        `Bạn chỉ có thể tự hủy trước giờ bắt đầu ít nhất ${cancelBeforeHours} giờ.`,
      );
    }

    let refundMessage = 'Lượt đặt đã được hủy. Lượt này chưa ghi nhận tiền cọc nên không có khoản cần hoàn.';
    if (booking.payment_status === 'deposit_paid') {
      if (Number(booking.seconds_until_start) >= refundFullBeforeHours * 60 * 60) {
        const [depositRows] = await connection.execute(
          `SELECT COALESCE(SUM(amount), 0) AS depositAmount
           FROM payments
           WHERE booking_id = ? AND type = 'deposit'`,
          [targetBookingId],
        );
        const depositAmount =
          Number(depositRows[0]?.depositAmount) || calculateDeposit(Number(booking.total_price));

        await connection.execute(
          `INSERT INTO payments (booking_id, amount, type, method, note, recorded_by)
           VALUES (?, ?, 'refund', NULL, ?, NULL)`,
          [
            targetBookingId,
            depositAmount,
            'Chờ nhân viên xác nhận hoàn cọc cho khách.',
          ],
        );
        refundMessage = 'Lượt đặt đã được hủy. Yêu cầu hoàn cọc đã ghi nhận và chờ nhân viên xác nhận.';
      } else {
        refundMessage = 'Lượt đặt đã được hủy. Theo chính sách, cọc không được hoàn do hủy chưa đủ thời hạn.';
      }
    }

    const [updateResult] = await connection.execute(
      `UPDATE bookings
       SET status = 'cancelled'
       WHERE id = ? AND user_id = ? AND status IN ('pending', 'confirmed')`,
      [targetBookingId, customerId],
    );
    if (updateResult.affectedRows !== 1) {
      throw createError(409, 'Lượt đặt đã thay đổi trạng thái. Vui lòng tải lại danh sách.');
    }

    return { bookingId: targetBookingId, message: refundMessage };
  });
}

module.exports = { createBooking, getMyBookings, cancelBooking };
