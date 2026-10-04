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
              WHERE p.booking_id = b.id AND p.type = 'refund' AND p.recorded_by IS NULL
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

const BOOKING_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'no_show', 'cancelled'],
  completed: [],
  no_show: [],
  cancelled: [],
};

async function getAdminBookings(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.status) {
    const allowedStatuses = ['pending', 'confirmed', 'completed', 'no_show', 'cancelled'];
    if (!allowedStatuses.includes(filters.status)) {
      throw createError(400, 'Trạng thái lượt đặt không hợp lệ.');
    }
    conditions.push('b.status = ?');
    params.push(filters.status);
  }

  if (filters.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
      throw createError(400, 'Ngày lọc phải đúng định dạng YYYY-MM-DD.');
    }
    conditions.push('b.booking_date = ?');
    params.push(filters.date);
  }

  if (filters.fieldId !== undefined && filters.fieldId !== '') {
    const fieldId = parsePositiveInteger(filters.fieldId, 'ID sân');
    conditions.push('b.field_id = ?');
    params.push(fieldId);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [bookings] = await pool.execute(
    `SELECT b.id, b.user_id AS userId, u.full_name AS customerName,
            u.email AS customerEmail, b.field_id AS fieldId, f.name AS fieldName,
            st.name AS sportTypeName,
            DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS date,
            TIME_FORMAT(b.start_time, '%H:%i') AS start,
            TIME_FORMAT(b.end_time, '%H:%i') AS end,
            CAST(b.total_price AS UNSIGNED) AS totalPrice,
            b.status, b.payment_status AS paymentStatus, b.note,
            DATE_FORMAT(b.expires_at, '%Y-%m-%d %H:%i:%s') AS expiresAt,
            GREATEST(TIMESTAMPDIFF(SECOND, NOW(), b.expires_at), 0) AS holdSecondsRemaining
     FROM bookings b
     INNER JOIN users u ON u.id = b.user_id
     INNER JOIN fields f ON f.id = b.field_id
     INNER JOIN sport_types st ON st.id = f.sport_type_id
     ${whereClause}
     ORDER BY b.booking_date DESC, b.start_time DESC, b.id DESC`,
    params,
  );

  if (bookings.length === 0) {
    return [];
  }

  const bookingIds = bookings.map((booking) => booking.id);
  const placeholders = bookingIds.map(() => '?').join(', ');
  const [payments] = await pool.execute(
    `SELECT p.id, p.booking_id AS bookingId, CAST(p.amount AS UNSIGNED) AS amount,
            p.type, p.method, p.note,
            p.recorded_by AS recordedBy, u.full_name AS recorderName,
            DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
     FROM payments p
     LEFT JOIN users u ON u.id = p.recorded_by
     WHERE p.booking_id IN (${placeholders})
     ORDER BY p.created_at, p.id`,
    bookingIds,
  );
  const paymentsByBooking = new Map();
  payments.forEach((payment) => {
    const list = paymentsByBooking.get(payment.bookingId) || [];
    list.push({ ...payment, amount: Number(payment.amount) });
    paymentsByBooking.set(payment.bookingId, list);
  });

  return bookings.map((booking) => ({
    ...booking,
    totalPrice: Number(booking.totalPrice),
    holdSecondsRemaining: Number(booking.holdSecondsRemaining) || 0,
    payments: paymentsByBooking.get(booking.id) || [],
  }));
}

async function getAdminBookingFields() {
  const [fields] = await pool.execute('SELECT id, name, status FROM fields ORDER BY name, id');
  return fields;
}

async function updateBookingStatus(bookingId, nextStatus) {
  const id = parsePositiveInteger(bookingId, 'ID lượt đặt');
  const allowedStatuses = Object.keys(BOOKING_STATUS_TRANSITIONS);
  if (!allowedStatuses.includes(nextStatus)) {
    throw createError(400, 'Trạng thái lượt đặt không hợp lệ.');
  }

  return withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT id, status, payment_status, expires_at,
              (expires_at IS NULL OR expires_at > NOW()) AS hold_valid,
              TIMESTAMPDIFF(SECOND, NOW(), TIMESTAMP(booking_date, start_time)) AS seconds_until_start
       FROM bookings
       WHERE id = ?
       FOR UPDATE`,
      [id],
    );
    const booking = rows[0];
    if (!booking) {
      throw createError(404, 'Không tìm thấy lượt đặt.');
    }

    const allowedNext = BOOKING_STATUS_TRANSITIONS[booking.status];
    if (!allowedNext.includes(nextStatus)) {
      throw createError(
        409,
        `Không thể chuyển lượt đặt từ ${booking.status} sang ${nextStatus}.`,
      );
    }

    if (nextStatus === 'confirmed') {
      if (!booking.hold_valid) {
        throw createError(409, 'Không thể xác nhận vì thời hạn giữ chỗ đã hết.');
      }

      const [depositRows] = await connection.execute(
        `SELECT COALESCE(SUM(amount), 0) AS depositAmount
         FROM payments
         WHERE booking_id = ? AND type = 'deposit'`,
        [id],
      );
      if (Number(depositRows[0]?.depositAmount) <= 0) {
        throw createError(409, 'Chỉ có thể xác nhận sau khi đã ghi nhận khoản tiền cọc.');
      }
    }

    if (
      ['completed', 'no_show'].includes(nextStatus) &&
      Number(booking.seconds_until_start) > 0
    ) {
      throw createError(409, 'Chỉ được chuyển sang completed hoặc no_show sau giờ bắt đầu.');
    }

    const nextPaymentStatus =
      booking.payment_status === 'paid' ? 'paid' : 'deposit_paid';
    const [result] = await connection.execute(
      'UPDATE bookings SET status = ?, payment_status = ? WHERE id = ? AND status = ?',
      [
        nextStatus,
        nextStatus === 'confirmed' ? nextPaymentStatus : booking.payment_status,
        id,
        booking.status,
      ],
    );
    if (result.affectedRows !== 1) {
      throw createError(409, 'Lượt đặt đã thay đổi trạng thái. Vui lòng tải lại danh sách.');
    }

    return {
      bookingId: id,
      status: nextStatus,
      paymentStatus: nextStatus === 'confirmed' ? nextPaymentStatus : booking.payment_status,
    };
  });
}

async function recordBookingPayment(bookingId, recordedBy, input = {}) {
  const id = parsePositiveInteger(bookingId, 'ID lượt đặt');
  const staffId = parsePositiveInteger(recordedBy, 'ID nhân viên');
  const { type, method, note } = input;
  const amount = Number(input.amount);

  if (!['deposit', 'balance', 'refund'].includes(type)) {
    throw createError(400, 'Loại khoản thu phải là deposit, balance hoặc refund.');
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw createError(400, 'Số tiền phải là số nguyên lớn hơn 0.');
  }
  if (typeof method !== 'string' || !method.trim() || method.trim().length > 50) {
    throw createError(400, 'Phương thức thanh toán không được để trống và tối đa 50 ký tự.');
  }
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 255)) {
    throw createError(400, 'Ghi chú thanh toán tối đa 255 ký tự.');
  }

  return withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT id, total_price, status, payment_status, expires_at,
              (expires_at IS NULL OR expires_at > NOW()) AS hold_valid
       FROM bookings
       WHERE id = ?
       FOR UPDATE`,
      [id],
    );
    const booking = rows[0];
    if (!booking) {
      throw createError(404, 'Không tìm thấy lượt đặt.');
    }

    const holdExpired = !booking.hold_valid;
    if (type !== 'refund' && (booking.status === 'cancelled' || booking.status === 'no_show')) {
      throw createError(409, 'Không thể ghi nhận khoản thu cho lượt đặt đã hủy hoặc không đến.');
    }
    if (type === 'deposit' && booking.status === 'pending' && holdExpired) {
      throw createError(409, 'Không thể ghi nhận cọc vì thời hạn giữ chỗ đã hết.');
    }
    if (type === 'deposit' && !['pending', 'confirmed'].includes(booking.status)) {
      throw createError(409, 'Chỉ ghi nhận tiền cọc cho lượt pending hoặc confirmed.');
    }
    if (type === 'balance' && !['confirmed', 'completed'].includes(booking.status)) {
      throw createError(409, 'Chỉ ghi nhận phần tiền còn lại cho lượt confirmed hoặc completed.');
    }

    const [totalsRows] = await connection.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN type IN ('deposit', 'balance') THEN amount ELSE 0 END), 0) AS received,
         COALESCE(SUM(CASE WHEN type = 'refund' AND recorded_by IS NOT NULL THEN amount ELSE 0 END), 0) AS refunded,
         COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) AS deposits
       FROM payments
       WHERE booking_id = ?`,
      [id],
    );
    const totals = totalsRows[0];
    const received = Number(totals.received);
    const refunded = Number(totals.refunded);
    const depositTotal = Number(totals.deposits);
    const balance = received - refunded;
    if (type === 'refund' && amount > balance) {
      throw createError(409, 'Số tiền hoàn không được vượt quá số tiền đã thu chưa hoàn.');
    }
    if (type !== 'refund' && balance + amount > Number(booking.total_price)) {
      throw createError(409, 'Tổng số tiền đã thu không được vượt quá tổng tiền lượt đặt.');
    }
    if (
      type === 'refund' &&
      !['cancelled', 'completed', 'no_show'].includes(booking.status)
    ) {
      throw createError(409, 'Chỉ được ghi nhận hoàn tiền cho lượt đã kết thúc hoặc bị hủy.');
    }

    let paymentId;
    if (type === 'refund') {
      const [refundRequests] = await connection.execute(
        `SELECT id, amount
         FROM payments
         WHERE booking_id = ? AND type = 'refund' AND recorded_by IS NULL
         ORDER BY id
         LIMIT 1
         FOR UPDATE`,
        [id],
      );
      const refundRequest = refundRequests[0];
      if (refundRequest) {
        if (Number(refundRequest.amount) !== amount) {
          throw createError(409, 'Số tiền xác nhận phải khớp với yêu cầu hoàn cọc đang chờ.');
        }
        await connection.execute(
          'UPDATE payments SET method = ?, note = ?, recorded_by = ? WHERE id = ? AND recorded_by IS NULL',
          [method.trim(), note?.trim() || 'Nhân viên xác nhận hoàn tiền.', staffId, refundRequest.id],
        );
        paymentId = refundRequest.id;
      }
    }

    if (!paymentId) {
      const [result] = await connection.execute(
        `INSERT INTO payments (booking_id, amount, type, method, note, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, amount, type, method.trim(), note?.trim() || null, staffId],
      );
      paymentId = result.insertId;
    }

    const nextBalance = type === 'refund' ? balance - amount : balance + amount;
    const nextDepositTotal = type === 'deposit' ? depositTotal + amount : depositTotal;
    const nextRefunded = type === 'refund' ? refunded + amount : refunded;
    let paymentStatus = 'unpaid';
    if (nextBalance >= Number(booking.total_price)) {
      paymentStatus = 'paid';
    } else if (nextDepositTotal - nextRefunded > 0) {
      paymentStatus = 'deposit_paid';
    }

    await connection.execute('UPDATE bookings SET payment_status = ? WHERE id = ?', [
      paymentStatus,
      id,
    ]);

    return {
      paymentId,
      bookingId: id,
      amount,
      type,
      method: method.trim(),
      note: note?.trim() || null,
      recordedBy: staffId,
      paymentStatus,
      balanceDue: Math.max(Number(booking.total_price) - nextBalance, 0),
    };
  });
}

module.exports = {
  createBooking,
  getMyBookings,
  cancelBooking,
  getAdminBookings,
  getAdminBookingFields,
  updateBookingStatus,
  recordBookingPayment,
};
