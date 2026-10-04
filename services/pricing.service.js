const { pool } = require('../config/db');
const { validateTimeRange } = require('./availability.service');

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseIntegerId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw createError(400, 'ID loại hình phải là số nguyên dương.');
  }
  return id;
}

function minuteOfDay(time) {
  const match = time.match(TIME_PATTERN);
  return Number(match[1]) * 60 + Number(match[2]);
}

function determineDayType(date) {
  const match = date.match(DATE_PATTERN);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'weekday';
}

function calculateDeposit(total, depositPercent = process.env.DEPOSIT_PERCENT || 30) {
  const amount = Number(total);
  const percent = Number(depositPercent);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Tổng tiền dùng để tính cọc không hợp lệ.');
  }
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error('Cấu hình DEPOSIT_PERCENT phải nằm trong khoảng 0-100.');
  }

  return Math.ceil((amount * percent) / 100 / 1000) * 1000;
}

async function calculatePrice(sportTypeId, date, start, end, db = pool) {
  const typeId = parseIntegerId(sportTypeId);
  validateTimeRange(date, start, end);

  const dayType = determineDayType(date);
  const [rules] = await db.execute(
    `SELECT start_time, end_time, price_per_hour
     FROM price_rules
     WHERE sport_type_id = ?
       AND day_type = ?
       AND start_time < ?
       AND end_time > ?
     ORDER BY start_time`,
    [typeId, dayType, end, start],
  );

  const startMinute = minuteOfDay(start);
  const endMinute = minuteOfDay(end);
  const breakdown = [];
  let totalPrice = 0;

  for (let slotStart = startMinute; slotStart < endMinute; slotStart += 60) {
    const slotEnd = slotStart + 60;
    const matchingRules = rules.filter((rule) => {
      const ruleStart = minuteOfDay(String(rule.start_time).slice(0, 5));
      const ruleEnd = minuteOfDay(String(rule.end_time).slice(0, 5));
      return ruleStart <= slotStart && slotStart < ruleEnd;
    });

    if (matchingRules.length === 0) {
      const slotStartText = `${String(Math.floor(slotStart / 60)).padStart(2, '0')}:00`;
      throw createError(
        422,
        `Lỗi cấu hình giá: không tìm thấy quy tắc giá cho khung ${slotStartText} (${dayType}).`,
      );
    }
    if (matchingRules.length > 1) {
      const slotStartText = `${String(Math.floor(slotStart / 60)).padStart(2, '0')}:00`;
      throw createError(
        500,
        `Lỗi cấu hình giá: có nhiều quy tắc giá khớp khung ${slotStartText}.`,
      );
    }

    const pricePerHour = Number(matchingRules[0].price_per_hour);
    if (!Number.isFinite(pricePerHour) || pricePerHour <= 0) {
      throw createError(500, 'Lỗi cấu hình giá: giá theo giờ phải lớn hơn 0.');
    }

    const slotPrice = Math.round(pricePerHour);
    const slotStartText = `${String(Math.floor(slotStart / 60)).padStart(2, '0')}:00`;
    const slotEndText = `${String(Math.floor(slotEnd / 60)).padStart(2, '0')}:00`;
    breakdown.push({
      start: slotStartText,
      end: slotEndText,
      pricePerHour: slotPrice,
      totalPrice: slotPrice,
    });
    totalPrice += slotPrice;
  }

  return {
    sportTypeId: typeId,
    date,
    dayType,
    start,
    end,
    breakdown,
    totalPrice,
    depositAmount: calculateDeposit(totalPrice),
  };
}

module.exports = { calculatePrice, calculateDeposit, determineDayType };
