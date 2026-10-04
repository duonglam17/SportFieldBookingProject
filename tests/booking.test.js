process.env.TZ = 'Asia/Ho_Chi_Minh';
process.env.OPEN_TIME = '06:00';
process.env.CLOSE_TIME = '22:00';
process.env.MAX_DAYS_AHEAD = '30';
process.env.MAX_HOURS_PER_BOOKING = '3';
process.env.HOLD_MINUTES = '30';
process.env.DEPOSIT_PERCENT = '30';
process.env.CANCEL_BEFORE_HOURS = '2';
process.env.REFUND_FULL_BEFORE_HOURS = '24';

const mockStore = {
  fields: [{ id: 1, sport_type_id: 1, status: 'active' }],
  bookings: [],
  payments: [],
  rules: [
    { start_time: '06:00:00', end_time: '17:00:00', price_per_hour: 300000 },
    { start_time: '17:00:00', end_time: '21:00:00', price_per_hour: 450000 },
    { start_time: '21:00:00', end_time: '22:00:00', price_per_hour: 300000 },
  ],
  nextBookingId: 1,
  transactionQueue: Promise.resolve(),
};

function mockOverlap(oldStart, oldEnd, newStart, newEnd) {
  return oldStart < newEnd && oldEnd > newStart;
}

function mockDateTime(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute).getTime();
}

function mockExecute(state, sql, params) {
  if (sql.includes('FROM fields WHERE id = ? FOR UPDATE')) {
    return [[...state.fields.filter((field) => field.id === params[0])]];
  }

  if (sql.includes('FROM bookings') && sql.includes('LIMIT 1')) {
    const [fieldId, date, end, start] = params;
    const now = Date.now();
    const booking = state.bookings.find((item) => {
      const effective =
        item.status === 'confirmed' ||
        (item.status === 'pending' && item.expiresAtMs > now);
      return (
        item.fieldId === fieldId &&
        item.date === date &&
        effective &&
        mockOverlap(item.start, item.end, start, end)
      );
    });
    return [booking ? [{ id: booking.id }] : []];
  }

  if (
    sql.includes('FROM bookings') &&
    sql.includes('FOR UPDATE') &&
    !sql.includes('SELECT id, user_id, field_id')
  ) {
    const id = params[0];
    const booking = state.bookings.find((item) => item.id === id);
    if (!booking) return [[]];

    if (sql.includes('seconds_until_start')) {
      return [[{
        id: booking.id,
        status: booking.status,
        payment_status: booking.paymentStatus,
        hold_valid: booking.expiresAtMs > Date.now() ? 1 : 0,
        seconds_until_start: Math.floor(
          (mockDateTime(booking.date, booking.start) - Date.now()) / 1000,
        ),
      }]];
    }

    return [[{
      id: booking.id,
      total_price: booking.totalPrice,
      status: booking.status,
      payment_status: booking.paymentStatus,
      hold_valid: booking.expiresAtMs > Date.now() ? 1 : 0,
    }]];
  }

  if (sql.includes('FROM blocked_slots')) {
    return [[]];
  }

  if (sql.includes('FROM price_rules')) {
    return [state.rules];
  }

  if (sql.includes('INSERT INTO bookings')) {
    const [userId, fieldId, date, start, end, totalPrice, note, holdMinutes] = params;
    const id = state.nextBookingId++;
    const expiresAtMs = Date.now() + holdMinutes * 60_000;
    const booking = {
      id,
      userId,
      fieldId,
      date,
      start,
      end,
      totalPrice,
      status: 'pending',
      paymentStatus: 'unpaid',
      note,
      expiresAtMs,
    };
    state.bookings.push(booking);
    return [{ insertId: id }];
  }

  if (sql.includes('SELECT id, user_id AS userId')) {
    const booking = state.bookings.find((item) => item.id === params[0]);
    return [
      booking
        ? [
            {
              id: booking.id,
              userId: booking.userId,
              fieldId: booking.fieldId,
              date: booking.date,
              start: booking.start,
              end: booking.end,
              totalPrice: booking.totalPrice,
              status: booking.status,
              paymentStatus: booking.paymentStatus,
              note: booking.note,
              expiresAt: new Date(booking.expiresAtMs).toISOString().slice(0, 19).replace('T', ' '),
            },
          ]
        : [],
    ];
  }

  if (sql.includes('TIMESTAMPDIFF') && sql.includes('FOR UPDATE')) {
    const [bookingId, userId] = params;
    const booking = state.bookings.find(
      (item) => item.id === bookingId && item.userId === userId,
    );
    if (!booking) return [[]];
    return [
      [
        {
          ...booking,
          user_id: booking.userId,
          field_id: booking.fieldId,
          total_price: booking.totalPrice,
          payment_status: booking.paymentStatus,
          seconds_until_start: Math.floor(
            (mockDateTime(booking.date, booking.start) - Date.now()) / 1000,
          ),
        },
      ],
    ];
  }

  if (sql.includes('SELECT COALESCE(SUM(amount), 0) AS depositAmount')) {
    const amount = state.payments
      .filter((payment) => payment.bookingId === params[0] && payment.type === 'deposit')
      .reduce((sum, payment) => sum + payment.amount, 0);
    return [[{ depositAmount: amount }]];
  }

  if (sql.includes('AS received') && sql.includes('AS deposits')) {
    const payments = state.payments.filter((payment) => payment.bookingId === params[0]);
    return [[{
      received: payments
        .filter((payment) => payment.type === 'deposit' || payment.type === 'balance')
        .reduce((sum, payment) => sum + payment.amount, 0),
      refunded: payments
        .filter((payment) => payment.type === 'refund' && payment.recordedBy !== null)
        .reduce((sum, payment) => sum + payment.amount, 0),
      deposits: payments
        .filter((payment) => payment.type === 'deposit')
        .reduce((sum, payment) => sum + payment.amount, 0),
    }]];
  }

  if (sql.includes('FROM payments') && sql.includes('recorded_by IS NULL')) {
    const pendingRefund = state.payments.find(
      (payment) =>
        payment.bookingId === params[0] &&
        payment.type === 'refund' &&
        payment.recordedBy === null,
    );
    return [pendingRefund ? [{ id: pendingRefund.id, amount: pendingRefund.amount }] : []];
  }

  if (sql.startsWith('UPDATE payments SET method')) {
    const payment = state.payments.find((item) => item.id === params[3]);
    if (!payment || payment.recordedBy !== null) return [{ affectedRows: 0 }];
    payment.method = params[0];
    payment.note = params[1];
    payment.recordedBy = params[2];
    return [{ affectedRows: 1 }];
  }

  if (sql.includes("INSERT INTO payments") && sql.includes("'refund'")) {
    state.payments.push({
      id: state.payments.length + 1,
      bookingId: params[0],
      amount: params[1],
      type: 'refund',
      note: params[2],
      recordedBy: null,
    });
    return [{ insertId: state.payments.length }];
  }

  if (sql.includes('INSERT INTO payments') && sql.includes('VALUES (?, ?, ?, ?, ?, ?)')) {
    const payment = {
      id: state.payments.length + 1,
      bookingId: params[0],
      amount: params[1],
      type: params[2],
      method: params[3],
      note: params[4],
      recordedBy: params[5],
    };
    state.payments.push(payment);
    return [{ insertId: payment.id }];
  }

  if (sql.startsWith('UPDATE bookings SET status = ?, payment_status = ?')) {
    const booking = state.bookings.find((item) => item.id === params[2]);
    if (!booking || booking.status !== params[3]) return [{ affectedRows: 0 }];
    booking.status = params[0];
    booking.paymentStatus = params[1];
    return [{ affectedRows: 1 }];
  }

  if (sql.startsWith('UPDATE bookings SET payment_status = ?')) {
    const booking = state.bookings.find((item) => item.id === params[1]);
    if (!booking) return [{ affectedRows: 0 }];
    booking.paymentStatus = params[0];
    return [{ affectedRows: 1 }];
  }

  if (sql.includes("SET status = 'cancelled'")) {
    const [bookingId, userId] = params;
    const booking = state.bookings.find(
      (item) =>
        item.id === bookingId &&
        item.userId === userId &&
        ['pending', 'confirmed'].includes(item.status),
    );
    if (!booking) return [{ affectedRows: 0 }];
    booking.status = 'cancelled';
    return [{ affectedRows: 1 }];
  }

  throw new Error(`Unexpected fixture SQL: ${sql}`);
}

jest.mock('../config/db', () => ({
  pool: {
    execute: jest.fn(),
  },
  withTransaction: async (callback) => {
    const previousTransaction = mockStore.transactionQueue;
    let release;
    mockStore.transactionQueue = new Promise((resolve) => {
      release = resolve;
    });
    await previousTransaction;

    const snapshot = structuredClone({
      bookings: mockStore.bookings,
      payments: mockStore.payments,
      nextBookingId: mockStore.nextBookingId,
    });
    const connection = {
      execute: async (sql, params) => mockExecute(mockStore, sql, params),
    };

    try {
      return await callback(connection);
    } catch (error) {
      mockStore.bookings = snapshot.bookings;
      mockStore.payments = snapshot.payments;
      mockStore.nextBookingId = snapshot.nextBookingId;
      throw error;
    } finally {
      release();
    }
  },
}));

jest.mock('../services/availability.service', () => {
  const actual = jest.requireActual('../services/availability.service');
  return {
    ...actual,
    isRangeFree: async (connection, fieldId, date, start, end) => {
      const [bookingRows] = await connection.execute(
        `SELECT id FROM bookings WHERE field_id = ? AND booking_date = ?
         AND start_time < ? AND end_time > ?
         AND (status = 'confirmed' OR (status = 'pending' AND expires_at > NOW()))
         LIMIT 1`,
        [fieldId, date, end, start],
      );
      if (bookingRows.length > 0) return false;
      const [blockedRows] = await connection.execute(
        'SELECT id FROM blocked_slots WHERE field_id = ? AND block_date = ? AND start_time < ? AND end_time > ? LIMIT 1',
        [fieldId, date, end, start],
      );
      return blockedRows.length === 0;
    },
  };
});

const {
  createBooking,
  cancelBooking,
  updateBookingStatus,
  recordBookingPayment,
} = require('../services/booking.service');

const TEST_DATE = '2026-10-05';

function addExistingBooking(options = {}) {
  const booking = {
    id: mockStore.nextBookingId++,
    userId: options.userId || 2,
    fieldId: options.fieldId || 1,
    date: options.date || TEST_DATE,
    start: options.start || '18:00',
    end: options.end || '19:00',
    totalPrice: options.totalPrice || 450000,
    status: options.status || 'confirmed',
    paymentStatus: options.paymentStatus || 'unpaid',
    expiresAtMs: options.expiresAtMs ?? Date.now() + 60_000,
  };
  mockStore.bookings.push(booking);
  return booking;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-03T10:00:00+07:00'));
  mockStore.fields = [{ id: 1, sport_type_id: 1, status: 'active' }];
  mockStore.bookings = [];
  mockStore.payments = [];
  mockStore.nextBookingId = 1;
  mockStore.transactionQueue = Promise.resolve();
});

afterEach(() => {
  jest.useRealTimers();
});

test('creates a pending booking with server-calculated price, deposit, transfer reference, and hold', async () => {
  const result = await createBooking(1, {
    fieldId: 1,
    date: TEST_DATE,
    start: '16:00',
    end: '18:00',
    note: 'Ghi chú kiểm thử',
  });

  expect(result.booking).toMatchObject({
    id: 1,
    userId: 1,
    fieldId: 1,
    status: 'pending',
    paymentStatus: 'unpaid',
    totalPrice: 750000,
    note: 'Ghi chú kiểm thử',
  });
  expect(result.totalPrice).toBe(750000);
  expect(result.depositAmount).toBe(225000);
  expect(result.transferReference).toBe('SB-1');
  expect(mockStore.bookings[0].expiresAtMs).toBe(Date.now() + 30 * 60_000);
});

test('rejects a booking that overlaps an active booking', async () => {
  addExistingBooking({ start: '17:00', end: '19:00' });

  await expect(
    createBooking(1, {
      fieldId: 1,
      date: TEST_DATE,
      start: '18:00',
      end: '20:00',
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(mockStore.bookings).toHaveLength(1);
});

test('two simultaneous requests for the same slot allow only one booking', async () => {
  const payload = {
    fieldId: 1,
    date: TEST_DATE,
    start: '18:00',
    end: '19:00',
  };
  const results = await Promise.allSettled([createBooking(1, payload), createBooking(2, payload)]);

  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect(results.find((result) => result.status === 'rejected').reason.statusCode).toBe(409);
  expect(mockStore.bookings).toHaveLength(1);
});

test('does not allow customer A to cancel customer B booking', async () => {
  const booking = addExistingBooking({ userId: 2, start: '18:00' });

  await expect(cancelBooking(1, booking.id)).rejects.toMatchObject({ statusCode: 404 });
  expect(booking.status).toBe('confirmed');
});

test('rejects cancellation less than the configured two hours before start', async () => {
  const booking = addExistingBooking({
    userId: 1,
    date: '2026-10-03',
    start: '11:30',
    status: 'pending',
  });
  jest.setSystemTime(new Date('2026-10-03T10:00:00+07:00'));

  await expect(cancelBooking(1, booking.id)).rejects.toMatchObject({ statusCode: 409 });
  expect(booking.status).toBe('pending');
});

test('does not let an expired pending booking reserve a slot again', async () => {
  addExistingBooking({
    date: TEST_DATE,
    start: '18:00',
    end: '19:00',
    status: 'pending',
    expiresAtMs: Date.now() - 1000,
  });

  const result = await createBooking(1, {
    fieldId: 1,
    date: TEST_DATE,
    start: '18:00',
    end: '19:00',
  });

  expect(result.booking.status).toBe('pending');
  expect(mockStore.bookings).toHaveLength(2);
});

test('records a refund request for a deposit-paid booking when cancelled early enough', async () => {
  const booking = addExistingBooking({
    userId: 1,
    date: '2026-10-05',
    start: '18:00',
    paymentStatus: 'deposit_paid',
    totalPrice: 450000,
    status: 'confirmed',
  });
  mockStore.payments.push({ bookingId: booking.id, type: 'deposit', amount: 135000 });

  const result = await cancelBooking(1, booking.id);

  expect(booking.status).toBe('cancelled');
  expect(mockStore.payments).toHaveLength(2);
  expect(mockStore.payments[1]).toMatchObject({
    bookingId: booking.id,
    amount: 135000,
    type: 'refund',
    recordedBy: null,
  });
  expect(result.message).toContain('chờ nhân viên xác nhận');
});

test('does not request a deposit refund when cancellation is inside the refund window', async () => {
  const booking = addExistingBooking({
    userId: 1,
    date: '2026-10-04',
    start: '08:00',
    paymentStatus: 'deposit_paid',
    totalPrice: 450000,
    status: 'confirmed',
  });
  mockStore.payments.push({ bookingId: booking.id, type: 'deposit', amount: 135000 });

  const result = await cancelBooking(1, booking.id);

  expect(booking.status).toBe('cancelled');
  expect(mockStore.payments).toHaveLength(1);
  expect(result.message).toContain('cọc không được hoàn');
});

test('expiry job marks pending bookings with expired holds as cancelled', async () => {
  const mockDb = {
    execute: jest.fn().mockResolvedValue([{ affectedRows: 2 }]),
  };
  const { expirePendingBookings } = require('../services/expiry.job');

  await expect(expirePendingBookings(mockDb)).resolves.toBe(2);
  expect(mockDb.execute).toHaveBeenCalledWith(
    expect.stringContaining("SET status = 'cancelled'"),
  );
  expect(mockDb.execute.mock.calls[0][0]).toContain('expires_at < NOW()');
});

test('rejects booking when the field is in maintenance', async () => {
  mockStore.fields[0].status = 'maintenance';

  await expect(
    createBooking(1, {
      fieldId: 1,
      date: TEST_DATE,
      start: '18:00',
      end: '19:00',
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
});

test('completes booking lifecycle: deposit, confirm, balance, then completed', async () => {
  const created = await createBooking(1, {
    fieldId: 1,
    date: TEST_DATE,
    start: '18:00',
    end: '19:00',
  });
  const bookingId = created.booking.id;

  const deposit = await recordBookingPayment(bookingId, 2, {
    type: 'deposit',
    amount: 135000,
    method: 'Chuyển khoản',
    note: 'Đã nhận cọc',
  });
  expect(deposit.paymentStatus).toBe('deposit_paid');

  await expect(updateBookingStatus(bookingId, 'confirmed')).resolves.toMatchObject({
    status: 'confirmed',
    paymentStatus: 'deposit_paid',
  });
  const balance = await recordBookingPayment(bookingId, 2, {
    type: 'balance',
    amount: 315000,
    method: 'Tiền mặt',
  });
  expect(balance.paymentStatus).toBe('paid');
  expect(balance.balanceDue).toBe(0);

  jest.setSystemTime(new Date('2026-10-05T19:00:00+07:00'));
  await expect(updateBookingStatus(bookingId, 'completed')).resolves.toMatchObject({
    status: 'completed',
    paymentStatus: 'paid',
  });
  expect(mockStore.bookings[0].status).toBe('completed');
  expect(mockStore.payments.map((payment) => payment.type)).toEqual(['deposit', 'balance']);
});

test('rejects invalid booking status order and premature completion', async () => {
  const booking = addExistingBooking({
    userId: 1,
    status: 'pending',
    date: TEST_DATE,
    start: '18:00',
  });

  await expect(updateBookingStatus(booking.id, 'completed')).rejects.toMatchObject({
    statusCode: 409,
  });
  await expect(updateBookingStatus(booking.id, 'confirmed')).rejects.toMatchObject({
    statusCode: 409,
    message: expect.stringContaining('tiền cọc'),
  });

  booking.status = 'completed';
  await expect(updateBookingStatus(booking.id, 'confirmed')).rejects.toMatchObject({
    statusCode: 409,
  });
});

test('rejects payments that exceed the booking total or an invalid refund', async () => {
  const booking = addExistingBooking({
    userId: 1,
    status: 'confirmed',
    totalPrice: 450000,
  });

  await expect(
    recordBookingPayment(booking.id, 2, {
      type: 'balance',
      amount: 450001,
      method: 'Chuyển khoản',
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(mockStore.payments).toHaveLength(0);
});

test('staff confirms a pending refund request without inserting a duplicate refund row', async () => {
  const booking = addExistingBooking({
    userId: 1,
    status: 'cancelled',
    paymentStatus: 'deposit_paid',
    totalPrice: 450000,
  });
  mockStore.payments.push(
    { id: 1, bookingId: booking.id, type: 'deposit', amount: 135000, recordedBy: 2 },
    {
      id: 2,
      bookingId: booking.id,
      type: 'refund',
      amount: 135000,
      recordedBy: null,
      method: null,
    },
  );

  const result = await recordBookingPayment(booking.id, 3, {
    type: 'refund',
    amount: 135000,
    method: 'Chuyển khoản',
  });

  expect(result.paymentId).toBe(2);
  expect(mockStore.payments).toHaveLength(2);
  expect(mockStore.payments[1]).toMatchObject({
    type: 'refund',
    amount: 135000,
    method: 'Chuyển khoản',
    recordedBy: 3,
  });
});

test('customer role receives 403 from staff/admin booking APIs', async () => {
  const express = require('express');
  const request = require('supertest');
  const adminBookingRoutes = require('../routes/admin-bookings.routes');
  const errorHandler = require('../middleware/errorHandler');
  const app = express();
  app.use((req, res, next) => {
    req.session = { userId: 1, role: 'customer' };
    next();
  });
  app.use('/api/admin/bookings', adminBookingRoutes);
  app.use(errorHandler);

  const response = await request(app).get('/api/admin/bookings');
  expect(response.status).toBe(403);
  expect(response.body).toEqual({
    ok: false,
    error: 'Bạn không có quyền thực hiện thao tác này.',
  });
});
