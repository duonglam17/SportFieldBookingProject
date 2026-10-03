process.env.TZ = 'Asia/Ho_Chi_Minh';

jest.mock('../config/db', () => ({
  pool: {
    execute: jest.fn(),
  },
}));

const { pool } = require('../config/db');
const {
  validateTimeRange,
  isRangeFree,
  getFieldSchedule,
  findAvailableFields,
} = require('../services/availability.service');

const TEST_DATE = '2026-10-04';
const bookings = [];
const blockedSlots = [];
const fields = [
  { id: 1, name: 'Sân đang bảo trì', sport_type_id: 1, status: 'maintenance' },
  { id: 2, name: 'Sân đã được đặt', sport_type_id: 1, status: 'active' },
  { id: 3, name: 'Sân đang bị khóa', sport_type_id: 1, status: 'active' },
  { id: 4, name: 'Sân còn trống', sport_type_id: 1, status: 'active' },
];

function rangesOverlap(oldStart, oldEnd, newStart, newEnd) {
  return oldStart < newEnd && oldEnd > newStart;
}

function createConnectionFixture() {
  return {
    execute: jest.fn(async (query, params) => {
      const [fieldId, date, newEnd, newStart] = params;

      if (query.includes('FROM bookings')) {
        const rows = bookings.filter((booking) => {
          const isEffective =
            booking.status === 'confirmed' ||
            (booking.status === 'pending' && booking.expiresAt > Date.now());

          return (
            booking.fieldId === fieldId &&
            booking.date === date &&
            isEffective &&
            rangesOverlap(booking.start, booking.end, newStart, newEnd)
          );
        });
        return [rows.length > 0 ? [{ id: rows[0].id }] : []];
      }

      const rows = blockedSlots.filter(
        (slot) =>
          slot.fieldId === fieldId &&
          slot.date === date &&
          rangesOverlap(slot.start, slot.end, newStart, newEnd),
      );
      return [rows.length > 0 ? [{ id: rows[0].id }] : []];
    }),
  };
}

function addBooking({
  id = bookings.length + 1,
  fieldId = 2,
  date = TEST_DATE,
  start,
  end,
  status = 'confirmed',
  expiresAt = Date.now() + 60_000,
}) {
  bookings.push({ id, fieldId, date, start, end, status, expiresAt });
}

function addBlockedSlot({ id = blockedSlots.length + 1, fieldId = 2, date = TEST_DATE, start, end }) {
  blockedSlots.push({ id, fieldId, date, start, end });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-03T10:00:00+07:00'));
  process.env.OPEN_TIME = '06:00';
  process.env.CLOSE_TIME = '22:00';
  process.env.MAX_DAYS_AHEAD = '30';
  process.env.MAX_HOURS_PER_BOOKING = '3';
  bookings.length = 0;
  blockedSlots.length = 0;
  pool.execute.mockReset();
});

afterEach(() => {
  bookings.length = 0;
  blockedSlots.length = 0;
  jest.useRealTimers();
});

describe('validateTimeRange', () => {
  test('accepts a booking that starts when the previous booking ends', () => {
    expect(validateTimeRange(TEST_DATE, '18:00', '19:00')).toBe(true);
  });

  test('rejects equal start and end times', () => {
    expect(() => validateTimeRange(TEST_DATE, '18:00', '18:00')).toThrow(
      'Giờ kết thúc phải sau giờ bắt đầu trong cùng một ngày.',
    );
  });

  test('rejects end time before start time', () => {
    expect(() => validateTimeRange(TEST_DATE, '19:00', '18:00')).toThrow(
      'Giờ kết thúc phải sau giờ bắt đầu trong cùng một ngày.',
    );
  });

  test('rejects times outside opening hours', () => {
    expect(() => validateTimeRange(TEST_DATE, '05:00', '06:00')).toThrow(
      'Khung giờ phải nằm trong giờ mở cửa 06:00-22:00.',
    );
    expect(() => validateTimeRange(TEST_DATE, '21:00', '23:00')).toThrow(
      'Khung giờ phải nằm trong giờ mở cửa 06:00-22:00.',
    );
  });

  test('rejects a past date and a past start time today', () => {
    expect(() => validateTimeRange('2026-10-02', '18:00', '19:00')).toThrow(
      'Không thể đặt sân vào ngày đã qua.',
    );
    expect(() => validateTimeRange('2026-10-03', '09:00', '10:00')).toThrow(
      'Giờ bắt đầu phải ở trong tương lai.',
    );
  });

  test('rejects malformed date/time, non-hour boundaries, and bookings over the limit', () => {
    expect(() => validateTimeRange('2026-02-30', '18:00', '19:00')).toThrow(
      'Ngày phải đúng định dạng YYYY-MM-DD và là ngày hợp lệ.',
    );
    expect(() => validateTimeRange(TEST_DATE, '18:30', '19:30')).toThrow(
      'Giờ bắt đầu và kết thúc phải đúng giờ chẵn, ví dụ 18:00.',
    );
    expect(() => validateTimeRange(TEST_DATE, '18:00', '22:00')).toThrow(
      'Mỗi lượt đặt không được vượt quá 3 giờ.',
    );
  });
});

describe('isRangeFree', () => {
  test('allows adjacent ranges when booking A ends at 18:00 and booking B starts at 18:00', async () => {
    addBooking({ start: '17:00', end: '18:00' });
    const conn = createConnectionFixture();

    await expect(isRangeFree(conn, 2, TEST_DATE, '18:00', '19:00')).resolves.toBe(true);
  });

  test('rejects partially overlapping and fully contained ranges', async () => {
    addBooking({ start: '17:00', end: '19:00' });
    const conn = createConnectionFixture();

    await expect(isRangeFree(conn, 2, TEST_DATE, '18:00', '20:00')).resolves.toBe(false);
    await expect(isRangeFree(conn, 2, TEST_DATE, '17:30', '18:00')).resolves.toBe(false);
  });

  test('rejects a slot blocked for maintenance', async () => {
    addBlockedSlot({ start: '18:00', end: '20:00' });
    const conn = createConnectionFixture();

    await expect(isRangeFree(conn, 2, TEST_DATE, '19:00', '20:00')).resolves.toBe(false);
  });

  test('does not count a pending booking whose hold has expired', async () => {
    addBooking({ start: '18:00', end: '19:00', status: 'pending', expiresAt: Date.now() - 1 });
    const conn = createConnectionFixture();

    await expect(isRangeFree(conn, 2, TEST_DATE, '18:00', '19:00')).resolves.toBe(true);
  });

  test('counts confirmed bookings regardless of hold expiry', async () => {
    addBooking({ start: '18:00', end: '19:00', status: 'confirmed', expiresAt: Date.now() - 1 });
    const conn = createConnectionFixture();

    await expect(isRangeFree(conn, 2, TEST_DATE, '18:00', '19:00')).resolves.toBe(false);
  });
});

describe('availability queries', () => {
  test('returns the database schedule for a field and date', async () => {
    const schedule = [
      { start: '17:00', end: '18:00', type: 'booked' },
      { start: '19:00', end: '20:00', type: 'blocked' },
    ];
    pool.execute.mockResolvedValue([schedule]);

    await expect(getFieldSchedule(2, TEST_DATE)).resolves.toEqual(schedule);
    expect(pool.execute.mock.calls[0][1]).toEqual([2, TEST_DATE, 2, TEST_DATE]);
    expect(pool.execute.mock.calls[0][0]).toContain("status = 'confirmed'");
    expect(pool.execute.mock.calls[0][0]).toContain('expires_at > NOW()');
  });

  test('queries only active fields, excluding occupied fields and their overlapping blocked slots', async () => {
    addBooking({ fieldId: 2, start: '18:00', end: '19:00', status: 'confirmed' });
    addBlockedSlot({ fieldId: 3, start: '18:30', end: '19:30' });
    addBooking({
      fieldId: 4,
      start: '18:00',
      end: '19:00',
      status: 'pending',
      expiresAt: Date.now() - 1,
    });
    pool.execute.mockImplementation(async (query, params) => {
      expect(query).toContain("f.status = 'active'");
      expect(query).toContain("b.status = 'confirmed'");
      expect(query).toContain('b.expires_at > NOW()');
      expect(query).toContain('bs.start_time < ?');
      expect(query).toContain('bs.end_time > ?');
      expect(params).toEqual([1, TEST_DATE, '19:00', '18:00', TEST_DATE, '19:00', '18:00']);

      const [sportTypeId, date, bookingEnd, bookingStart, blockDate, blockEnd, blockStart] = params;
      const available = fields.filter((field) => {
        if (field.status !== 'active' || field.sport_type_id !== sportTypeId) return false;

        const hasBooking = bookings.some((booking) => {
          const isEffective =
            booking.status === 'confirmed' ||
            (booking.status === 'pending' && booking.expiresAt > Date.now());
          return (
            booking.fieldId === field.id &&
            booking.date === date &&
            isEffective &&
            rangesOverlap(booking.start, booking.end, bookingStart, bookingEnd)
          );
        });
        const hasBlock = blockedSlots.some(
          (slot) =>
            slot.fieldId === field.id &&
            slot.date === blockDate &&
            rangesOverlap(slot.start, slot.end, blockStart, blockEnd),
        );

        return !hasBooking && !hasBlock;
      });

      return [available];
    });

    await expect(findAvailableFields(1, TEST_DATE, '18:00', '19:00')).resolves.toEqual([
      fields[3],
    ]);
  });
});
