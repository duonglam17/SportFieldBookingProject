const { pool } = require('../config/db');

function normalizeTime(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) {
    return null;
  }

  const [, hours, minutes, seconds = '00'] = match;
  return `${hours}:${minutes}:${seconds}`;
}

function validatePositiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} phải là số nguyên dương.`);
  }
  return parsed;
}

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function ensureSportTypeExists(sportTypeId) {
  const [rows] = await pool.execute('SELECT id FROM sport_types WHERE id = ? LIMIT 1', [sportTypeId]);
  if (rows.length === 0) {
    throw createError(404, 'Loại hình thể thao không tồn tại.');
  }
}

async function ensureFieldNameUnique(name, excludeId = null) {
  const [rows] = await pool.execute(
    'SELECT id FROM fields WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1',
    [name, excludeId ?? -1],
  );
  if (rows.length > 0) {
    throw createError(409, 'Tên sân đã tồn tại. Vui lòng chọn tên khác.');
  }
}

async function ensureNoFutureBookingsForField(fieldId) {
  const [rows] = await pool.execute(
    `SELECT id
     FROM bookings
     WHERE field_id = ?
       AND status IN ('pending', 'confirmed')
       AND (
         booking_date > CURDATE()
         OR (booking_date = CURDATE() AND start_time > CURTIME())
       )
     LIMIT 1`,
    [fieldId],
  );

  if (rows.length > 0) {
    throw createError(
      409,
      'Không thể xóa sân vì đang có lượt đặt pending/confirmed trong tương lai. Hãy chuyển sân sang trạng thái maintenance.',
    );
  }
}

async function ensureNoOverlappingPriceRules(sportTypeId, dayType, startTime, endTime, ignoreId = null) {
  const [rows] = await pool.execute(
    `SELECT id, start_time, end_time
     FROM price_rules
     WHERE sport_type_id = ?
       AND day_type = ?
       AND id != ?
       AND start_time < ?
       AND end_time > ?
     LIMIT 1`,
    [sportTypeId, dayType, ignoreId ?? -1, endTime, startTime],
  );

  if (rows.length > 0) {
    throw createError(409, 'Quy tắc giá này chồng lấn với quy tắc giá khác cùng loại hình và cùng day_type.');
  }
}

async function getSportTypes(req, res, next) {
  try {
    const [rows] = await pool.execute('SELECT * FROM sport_types ORDER BY id');
    res.json({ ok: true, data: rows });
  } catch (error) {
    next(error);
  }
}

async function createSportType(req, res, next) {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      throw createError(400, 'Tên loại hình thể thao không được để trống.');
    }

    const [existing] = await pool.execute('SELECT id FROM sport_types WHERE LOWER(name) = LOWER(?) LIMIT 1', [
      name,
    ]);
    if (existing.length > 0) {
      throw createError(409, 'Tên loại hình thể thao đã tồn tại.');
    }

    const [result] = await pool.execute(
      'INSERT INTO sport_types (name, description) VALUES (?, ?)',
      [name, req.body.description || null],
    );

    res.status(201).json({ ok: true, data: { id: result.insertId, name, description: req.body.description || null } });
  } catch (error) {
    next(error);
  }
}

async function updateSportType(req, res, next) {
  try {
    const id = validatePositiveInteger(req.params.id, 'ID loại hình');
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      throw createError(400, 'Tên loại hình thể thao không được để trống.');
    }

    const [existing] = await pool.execute(
      'SELECT id FROM sport_types WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1',
      [name, id],
    );
    if (existing.length > 0) {
      throw createError(409, 'Tên loại hình thể thao đã tồn tại.');
    }

    await pool.execute('UPDATE sport_types SET name = ?, description = ? WHERE id = ?', [
      name,
      req.body.description || null,
      id,
    ]);

    res.json({ ok: true, data: { id, name, description: req.body.description || null } });
  } catch (error) {
    next(error);
  }
}

async function deleteSportType(req, res, next) {
  try {
    const id = validatePositiveInteger(req.params.id, 'ID loại hình');
    const [fieldRows] = await pool.execute('SELECT id FROM fields WHERE sport_type_id = ? LIMIT 1', [id]);
    if (fieldRows.length > 0) {
      throw createError(409, 'Không thể xóa loại hình đang có sân. Hãy xóa hoặc gỡ các sân trước khi xóa loại hình.');
    }

    const [result] = await pool.execute('DELETE FROM sport_types WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      throw createError(404, 'Loại hình thể thao không tồn tại.');
    }

    res.json({ ok: true, data: { message: 'Xóa loại hình thể thao thành công.' } });
  } catch (error) {
    next(error);
  }
}

async function getFields(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT f.*, st.name AS sport_type_name
       FROM fields f
       INNER JOIN sport_types st ON st.id = f.sport_type_id
       ORDER BY f.id`,
    );
    res.json({ ok: true, data: rows });
  } catch (error) {
    next(error);
  }
}

async function createField(req, res, next) {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const sportTypeId = validatePositiveInteger(req.body.sportTypeId, 'ID loại hình');
    await ensureSportTypeExists(sportTypeId);

    if (!name) {
      throw createError(400, 'Tên sân không được để trống.');
    }
    if (!['active', 'maintenance'].includes(req.body.status || 'active')) {
      throw createError(400, 'Trạng thái sân không hợp lệ.');
    }

    await ensureFieldNameUnique(name);

    const [result] = await pool.execute(
      'INSERT INTO fields (name, sport_type_id, description, image_url, status) VALUES (?, ?, ?, ?, ?)',
      [name, sportTypeId, req.body.description || null, req.body.imageUrl || null, req.body.status || 'active'],
    );

    res.status(201).json({
      ok: true,
      data: {
        id: result.insertId,
        name,
        sportTypeId,
        description: req.body.description || null,
        imageUrl: req.body.imageUrl || null,
        status: req.body.status || 'active',
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateField(req, res, next) {
  try {
    const id = validatePositiveInteger(req.params.id, 'ID sân');
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const sportTypeId = validatePositiveInteger(req.body.sportTypeId, 'ID loại hình');

    if (!name) {
      throw createError(400, 'Tên sân không được để trống.');
    }
    if (!['active', 'maintenance'].includes(req.body.status || 'active')) {
      throw createError(400, 'Trạng thái sân không hợp lệ.');
    }

    await ensureSportTypeExists(sportTypeId);
    await ensureFieldNameUnique(name, id);

    await pool.execute(
      'UPDATE fields SET name = ?, sport_type_id = ?, description = ?, image_url = ?, status = ? WHERE id = ?',
      [name, sportTypeId, req.body.description || null, req.body.imageUrl || null, req.body.status || 'active', id],
    );

    res.json({
      ok: true,
      data: {
        id,
        name,
        sportTypeId,
        description: req.body.description || null,
        imageUrl: req.body.imageUrl || null,
        status: req.body.status || 'active',
      },
    });
  } catch (error) {
    next(error);
  }
}

async function toggleFieldStatus(req, res, next) {
  try {
    const id = validatePositiveInteger(req.params.id, 'ID sân');
    const status = req.body.status || 'active';
    if (!['active', 'maintenance'].includes(status)) {
      throw createError(400, 'Trạng thái sân không hợp lệ.');
    }

    await pool.execute('UPDATE fields SET status = ? WHERE id = ?', [status, id]);
    res.json({ ok: true, data: { id, status } });
  } catch (error) {
    next(error);
  }
}

async function deleteField(req, res, next) {
  try {
    const id = validatePositiveInteger(req.params.id, 'ID sân');
    await ensureNoFutureBookingsForField(id);

    const [result] = await pool.execute('DELETE FROM fields WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      throw createError(404, 'Sân không tồn tại.');
    }

    res.json({ ok: true, data: { message: 'Xóa sân thành công.' } });
  } catch (error) {
    next(error);
  }
}

async function getPriceRules(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT pr.*, st.name AS sport_type_name
       FROM price_rules pr
       INNER JOIN sport_types st ON st.id = pr.sport_type_id
       ORDER BY pr.sport_type_id, pr.day_type, pr.start_time`,
    );
    res.json({ ok: true, data: rows });
  } catch (error) {
    next(error);
  }
}

async function createPriceRule(req, res, next) {
  try {
    const sportTypeId = validatePositiveInteger(req.body.sportTypeId, 'ID loại hình');
    const dayType = req.body.dayType;
    const startTime = normalizeTime(req.body.startTime);
    const endTime = normalizeTime(req.body.endTime);
    const pricePerHour = Number(req.body.pricePerHour);

    if (!['weekday', 'weekend'].includes(dayType)) {
      throw createError(400, 'dayType phải là weekday hoặc weekend.');
    }
    if (!startTime || !endTime) {
      throw createError(400, 'Thời gian phải theo định dạng HH:MM hoặc HH:MM:SS.');
    }
    if (startTime >= endTime) {
      throw createError(400, 'Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc.');
    }
    if (!Number.isFinite(pricePerHour) || pricePerHour <= 0) {
      throw createError(400, 'Giá theo giờ phải lớn hơn 0.');
    }

    await ensureSportTypeExists(sportTypeId);
    await ensureNoOverlappingPriceRules(sportTypeId, dayType, startTime, endTime);

    const [result] = await pool.execute(
      'INSERT INTO price_rules (sport_type_id, day_type, start_time, end_time, price_per_hour) VALUES (?, ?, ?, ?, ?)',
      [sportTypeId, dayType, startTime, endTime, pricePerHour],
    );

    res.status(201).json({
      ok: true,
      data: {
        id: result.insertId,
        sportTypeId,
        dayType,
        startTime,
        endTime,
        pricePerHour,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updatePriceRule(req, res, next) {
  try {
    const id = validatePositiveInteger(req.params.id, 'ID quy tắc giá');
    const sportTypeId = validatePositiveInteger(req.body.sportTypeId, 'ID loại hình');
    const dayType = req.body.dayType;
    const startTime = normalizeTime(req.body.startTime);
    const endTime = normalizeTime(req.body.endTime);
    const pricePerHour = Number(req.body.pricePerHour);

    if (!['weekday', 'weekend'].includes(dayType)) {
      throw createError(400, 'dayType phải là weekday hoặc weekend.');
    }
    if (!startTime || !endTime) {
      throw createError(400, 'Thời gian phải theo định dạng HH:MM hoặc HH:MM:SS.');
    }
    if (startTime >= endTime) {
      throw createError(400, 'Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc.');
    }
    if (!Number.isFinite(pricePerHour) || pricePerHour <= 0) {
      throw createError(400, 'Giá theo giờ phải lớn hơn 0.');
    }

    await ensureSportTypeExists(sportTypeId);
    await ensureNoOverlappingPriceRules(sportTypeId, dayType, startTime, endTime, id);

    await pool.execute(
      'UPDATE price_rules SET sport_type_id = ?, day_type = ?, start_time = ?, end_time = ?, price_per_hour = ? WHERE id = ?',
      [sportTypeId, dayType, startTime, endTime, pricePerHour, id],
    );

    res.json({ ok: true, data: { id, sportTypeId, dayType, startTime, endTime, pricePerHour } });
  } catch (error) {
    next(error);
  }
}

async function deletePriceRule(req, res, next) {
  try {
    const id = validatePositiveInteger(req.params.id, 'ID quy tắc giá');
    const [result] = await pool.execute('DELETE FROM price_rules WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      throw createError(404, 'Quy tắc giá không tồn tại.');
    }

    res.json({ ok: true, data: { message: 'Xóa quy tắc giá thành công.' } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSportTypes,
  createSportType,
  updateSportType,
  deleteSportType,
  getFields,
  createField,
  updateField,
  toggleFieldStatus,
  deleteField,
  getPriceRules,
  createPriceRule,
  updatePriceRule,
  deletePriceRule,
};
