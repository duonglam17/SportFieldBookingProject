const { calculateStatistics, validateMonth } = require('../services/stats.service');

describe('monthly booking statistics', () => {
  test('aggregates revenue, booking statuses, hourly use, top hours, and per-field counts', () => {
    const stats = calculateStatistics({
      month: '2024-02',
      openTime: '06:00',
      closeTime: '22:00',
      payments: [
        { date: '2024-02-01', type: 'deposit', amount: 100 },
        { date: '2024-02-01', type: 'balance', amount: 50 },
        { date: '2024-02-01', type: 'refund', amount: 20 },
        { date: '2024-02-29', type: 'deposit', amount: 200 },
        { date: '2024-02-29', type: 'refund', amount: 25 },
        { date: '2024-03-01', type: 'deposit', amount: 999 },
      ],
      bookings: [
        { fieldId: 1, status: 'confirmed', start: '17:00', end: '19:00' },
        { fieldId: 1, status: 'no_show', start: '17:00', end: '18:00' },
        { fieldId: 2, status: 'cancelled', start: '17:00', end: '18:00' },
        { fieldId: 2, status: 'pending', start: '18:00', end: '19:00' },
      ],
      fields: [
        { id: 1, name: 'Sân A' },
        { id: 2, name: 'Sân B' },
        { id: 3, name: 'Sân C' },
      ],
    });

    expect(stats.month).toBe('2024-02');
    expect(stats.summary).toEqual({
      totalRevenue: 305,
      bookingCount: 4,
      noShowCount: 1,
      noShowRate: 0.25,
    });
    expect(stats.revenueByDay).toHaveLength(29);
    expect(stats.revenueByDay[0]).toEqual({ date: '2024-02-01', revenue: 130 });
    expect(stats.revenueByDay[28]).toEqual({ date: '2024-02-29', revenue: 175 });
    expect(stats.bookingsByStatus).toEqual({
      pending: 1,
      confirmed: 1,
      completed: 0,
      no_show: 1,
      cancelled: 1,
    });
    expect(stats.bookingsByHour.find(({ start }) => start === '17:00').count).toBe(2);
    expect(stats.bookingsByHour.find(({ start }) => start === '18:00').count).toBe(2);
    expect(stats.topTimeSlots.slice(0, 2)).toEqual([
      { start: '17:00', end: '18:00', count: 2 },
      { start: '18:00', end: '19:00', count: 2 },
    ]);
    expect(stats.bookingsByField).toEqual([
      { fieldId: 1, fieldName: 'Sân A', count: 2 },
      { fieldId: 2, fieldName: 'Sân B', count: 2 },
      { fieldId: 3, fieldName: 'Sân C', count: 0 },
    ]);
  });

  test('validates month format and returns zero no-show rate for an empty month', () => {
    expect(() => validateMonth('2026-13')).toThrow('Tháng phải đúng định dạng YYYY-MM.');
    expect(() => validateMonth('2026-1')).toThrow('Tháng phải đúng định dạng YYYY-MM.');

    const stats = calculateStatistics({
      month: '2026-10',
      payments: [],
      bookings: [],
      fields: [],
      openTime: '06:00',
      closeTime: '22:00',
    });

    expect(stats.summary).toEqual({
      totalRevenue: 0,
      bookingCount: 0,
      noShowCount: 0,
      noShowRate: 0,
    });
    expect(stats.revenueByDay).toHaveLength(31);
  });

  test('does not count expired pending holds as popular time slots', () => {
    const stats = calculateStatistics({
      month: '2026-10',
      payments: [],
      bookings: [
        {
          fieldId: 1,
          status: 'pending',
          start: '17:00',
          end: '18:00',
          expiredPending: true,
        },
      ],
      fields: [{ id: 1, name: 'Sân A' }],
      openTime: '06:00',
      closeTime: '22:00',
    });

    expect(stats.bookingsByStatus.pending).toBe(1);
    expect(stats.bookingsByHour.find(({ start }) => start === '17:00').count).toBe(0);
    expect(stats.topTimeSlots).toEqual([]);
  });
});
