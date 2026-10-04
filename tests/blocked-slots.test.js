process.env.TZ = 'Asia/Ho_Chi_Minh';
process.env.OPEN_TIME = '06:00';
process.env.CLOSE_TIME = '22:00';
process.env.MAX_DAYS_AHEAD = '30';
process.env.MAX_HOURS_PER_BOOKING = '3';
process.env.HOLD_MINUTES = '30';
process.env.DEPOSIT_PERCENT = '30';

const mockState = {
  fields: [{ id: 1, name: 'Sân A1', sport_type_id: 1, status: 'active' }],
  bookings: [],
  blockedSlots: [],
  nextId: 1,
  queue: Promise.resolve(),
};

function overlaps(oldStart, oldEnd, newStart, newEnd) {
  return oldStart < newEnd && oldEnd > newStart;
}

function mockFixtureConnection() {
  return {
    execute: async (sql, params) => {
      if (sql.includes('FROM fields WHERE id = ? FOR UPDATE')) {
        return [mockState.fields.filter((field) => field.id === params[0])];
      }

      if (sql.includes('FROM bookings b') && sql.includes('FOR UPDATE')) {
        const [fieldId, date, end, start] = params;
        const conflicts = mockState.bookings.filter((booking) => {
          const effective =
            booking.status === 'confirmed' ||
            (booking.status === 'pending' && booking.expiresAt > Date.now());
          return (
            booking.fieldId === fieldId &&
            booking.date === date &&
            effective &&
            overlaps(booking.start, booking.end, start, end)
          );
        });
        return [
          conflicts.map((booking) => ({
            bookingId: booking.id,
            userId: booking.userId,
            customerName: booking.customerName,
            status: booking.status,
            date: booking.date,
            start: booking.start,
            end: booking.end,
          })),
        ];
      }

      if (sql.includes('INSERT INTO blocked_slots')) {
        const [fieldId, date, start, end, reason, createdBy] = params;
        const slot = {
          id: mockState.nextId++,
          fieldId,
          date,
          start,
          end,
          reason,
          createdBy,
        };
        mockState.blockedSlots.push(slot);
        return [{ insertId: slot.id }];
      }

      if (sql.includes('FROM bookings') && sql.includes('LIMIT 1')) {
        const [fieldId, date, end, start] = params;
        const found = mockState.bookings.some((booking) => {
          const effective =
            booking.status === 'confirmed' ||
            (booking.status === 'pending' && booking.expiresAt > Date.now());
          return (
            booking.fieldId === fieldId &&
            booking.date === date &&
            effective &&
            overlaps(booking.start, booking.end, start, end)
          );
        });
        return [found ? [{ id: 1 }] : []];
      }

      if (sql.includes('FROM blocked_slots') && sql.includes('LIMIT 1')) {
        const [fieldId, date, end, start] = params;
        const found = mockState.blockedSlots.some(
          (slot) =>
            slot.fieldId === fieldId &&
            slot.date === date &&
            overlaps(slot.start, slot.end, start, end),
        );
        return [found ? [{ id: 1 }] : []];
      }

      if (sql.includes('FROM price_rules')) {
        return [[
          { start_time: '06:00:00', end_time: '17:00:00', price_per_hour: 300000 },
          { start_time: '17:00:00', end_time: '21:00:00', price_per_hour: 450000 },
          { start_time: '21:00:00', end_time: '22:00:00', price_per_hour: 300000 },
        ]];
      }

      throw new Error(`Unexpected SQL in blocked-slot test: ${sql}`);
    },
  };
}

jest.mock('../config/db', () => ({
  pool: { execute: jest.fn() },
  withTransaction: async (callback) => {
    const prior = mockState.queue;
    let release;
    mockState.queue = new Promise((resolve) => {
      release = resolve;
    });
    await prior;
    const snapshot = structuredClone({
      blockedSlots: mockState.blockedSlots,
      nextId: mockState.nextId,
    });

    try {
      return await callback(mockFixtureConnection());
    } catch (error) {
      mockState.blockedSlots = snapshot.blockedSlots;
      mockState.nextId = snapshot.nextId;
      throw error;
    } finally {
      release();
    }
  },
}));

const { createBlockedSlot } = require('../services/blocked-slots.service');
const { createBooking } = require('../services/booking.service');
const { isRangeFree } = require('../services/availability.service');

const FUTURE_DATE = '2026-10-05';

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-04T10:00:00+07:00'));
  mockState.fields = [{ id: 1, name: 'Sân A1', sport_type_id: 1, status: 'active' }];
  mockState.bookings = [];
  mockState.blockedSlots = [];
  mockState.nextId = 1;
  mockState.queue = Promise.resolve();
});

afterEach(() => {
  jest.useRealTimers();
});

test('rejects a blocked slot overlapping a valid pending or confirmed booking and returns conflicts', async () => {
  mockState.bookings.push({
    id: 42,
    userId: 7,
    customerName: 'Khách thử',
    fieldId: 1,
    date: FUTURE_DATE,
    start: '18:00',
    end: '20:00',
    status: 'confirmed',
    expiresAt: Date.now() - 1000,
  });
  mockState.bookings.push({
    id: 44,
    userId: 9,
    customerName: 'Khách giữ chỗ còn hạn',
    fieldId: 1,
    date: FUTURE_DATE,
    start: '20:00',
    end: '21:00',
    status: 'pending',
    expiresAt: Date.now() + 60_000,
  });

  await expect(
    createBlockedSlot(2, {
      fieldId: 1,
      date: FUTURE_DATE,
      start: '19:00',
      end: '21:00',
      reason: 'Bảo trì',
    }),
  ).rejects.toMatchObject({
    statusCode: 409,
    details: {
      conflicts: expect.arrayContaining([
        expect.objectContaining({
          bookingId: 42,
          customerName: 'Khách thử',
          status: 'confirmed',
        }),
        expect.objectContaining({
          bookingId: 44,
          customerName: 'Khách giữ chỗ còn hạn',
          status: 'pending',
        }),
      ]),
    },
  });
  expect(mockState.blockedSlots).toHaveLength(0);
});

test('creates a blocked slot that makes the same time unavailable to customers', async () => {
  const blocked = await createBlockedSlot(2, {
    fieldId: 1,
    date: FUTURE_DATE,
    start: '18:00',
    end: '20:00',
    reason: 'Bảo trì mặt sân',
  });
  const free = await isRangeFree(
    mockFixtureConnection(),
    1,
    FUTURE_DATE,
    '19:00',
    '20:00',
  );

  expect(blocked).toMatchObject({
    id: 1,
    fieldId: 1,
    date: FUTURE_DATE,
    start: '18:00',
    end: '20:00',
    reason: 'Bảo trì mặt sân',
    createdBy: 2,
  });
  expect(free).toBe(false);
  await expect(
    createBooking(5, {
      fieldId: 1,
      date: FUTURE_DATE,
      start: '19:00',
      end: '20:00',
      note: '',
    }),
  ).rejects.toMatchObject({
    statusCode: 409,
    message: 'Khung giờ vừa được đặt hoặc bị khóa. Vui lòng chọn khung giờ khác.',
  });
});

test('does not treat an expired pending booking as a conflict when creating a block', async () => {
  mockState.bookings.push({
    id: 43,
    userId: 8,
    customerName: 'Khách giữ chỗ hết hạn',
    fieldId: 1,
    date: FUTURE_DATE,
    start: '18:00',
    end: '20:00',
    status: 'pending',
    expiresAt: Date.now() - 1000,
  });

  await expect(
    createBlockedSlot(2, {
      fieldId: 1,
      date: FUTURE_DATE,
      start: '18:00',
      end: '20:00',
      reason: 'Bảo trì',
    }),
  ).resolves.toMatchObject({ id: 1 });
});
