process.env.TZ = 'Asia/Ho_Chi_Minh';

jest.mock('../config/db', () => ({
  pool: {
    execute: jest.fn(),
  },
}));

const { pool } = require('../config/db');
const { calculatePrice, calculateDeposit } = require('../services/pricing.service');

const WEEKDAY_DATE = '2026-10-05';
const SATURDAY_DATE = '2026-10-03';
const weekdayRules = [
  { start_time: '06:00:00', end_time: '17:00:00', price_per_hour: 300000 },
  { start_time: '17:00:00', end_time: '21:00:00', price_per_hour: 450000 },
  { start_time: '21:00:00', end_time: '22:00:00', price_per_hour: 300000 },
];
const weekendRules = [
  { start_time: '06:00:00', end_time: '17:00:00', price_per_hour: 360000 },
  { start_time: '17:00:00', end_time: '21:00:00', price_per_hour: 540000 },
  { start_time: '21:00:00', end_time: '22:00:00', price_per_hour: 360000 },
];

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-01T12:00:00+07:00'));
  process.env.OPEN_TIME = '06:00';
  process.env.CLOSE_TIME = '22:00';
  process.env.MAX_DAYS_AHEAD = '30';
  process.env.MAX_HOURS_PER_BOOKING = '3';
  process.env.DEPOSIT_PERCENT = '30';
  pool.execute.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

test('prices a booking entirely in regular hours', async () => {
  pool.execute.mockResolvedValue([weekdayRules]);

  const result = await calculatePrice(1, WEEKDAY_DATE, '10:00', '12:00');

  expect(result.dayType).toBe('weekday');
  expect(result.totalPrice).toBe(600000);
  expect(result.breakdown).toEqual([
    { start: '10:00', end: '11:00', pricePerHour: 300000, totalPrice: 300000 },
    { start: '11:00', end: '12:00', pricePerHour: 300000, totalPrice: 300000 },
  ]);
});

test('prices a booking entirely in peak hours', async () => {
  pool.execute.mockResolvedValue([weekdayRules]);

  const result = await calculatePrice(1, WEEKDAY_DATE, '18:00', '20:00');

  expect(result.totalPrice).toBe(900000);
  expect(result.breakdown.map((slot) => slot.pricePerHour)).toEqual([450000, 450000]);
});

test('splits the hourly total when a booking crosses the peak-hour boundary', async () => {
  pool.execute.mockResolvedValue([weekdayRules]);

  const result = await calculatePrice(1, WEEKDAY_DATE, '16:00', '18:00');

  expect(result.totalPrice).toBe(750000);
  expect(result.breakdown).toEqual([
    { start: '16:00', end: '17:00', pricePerHour: 300000, totalPrice: 300000 },
    { start: '17:00', end: '18:00', pricePerHour: 450000, totalPrice: 450000 },
  ]);
});

test('uses weekend pricing on Saturday and weekday pricing on Monday', async () => {
  pool.execute.mockResolvedValueOnce([weekendRules]).mockResolvedValueOnce([weekdayRules]);

  const saturday = await calculatePrice(1, SATURDAY_DATE, '10:00', '11:00');
  const monday = await calculatePrice(1, WEEKDAY_DATE, '10:00', '11:00');

  expect(saturday.dayType).toBe('weekend');
  expect(saturday.totalPrice).toBe(360000);
  expect(monday.dayType).toBe('weekday');
  expect(monday.totalPrice).toBe(300000);
});

test('throws a clear price-configuration error if an hour has no matching rule', async () => {
  pool.execute.mockResolvedValue([
    [{ start_time: '06:00:00', end_time: '17:00:00', price_per_hour: 300000 }],
  ]);

  await expect(calculatePrice(1, WEEKDAY_DATE, '17:00', '18:00')).rejects.toMatchObject({
    statusCode: 422,
    message: expect.stringContaining('Lỗi cấu hình giá'),
  });
});

test('rounds the deposit upward to the nearest thousand', () => {
  expect(calculateDeposit(100001, 30)).toBe(31000);
  expect(calculateDeposit(100000, 30)).toBe(30000);
});

test('sends parameterized rule lookup scoped to sport type and weekday/weekend', async () => {
  pool.execute.mockResolvedValue([weekdayRules]);

  await calculatePrice(7, WEEKDAY_DATE, '16:00', '17:00');

  expect(pool.execute).toHaveBeenCalledWith(
    expect.stringContaining('sport_type_id = ?'),
    [7, 'weekday', '17:00', '16:00'],
  );
});
