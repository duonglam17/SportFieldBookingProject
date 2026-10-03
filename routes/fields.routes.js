const express = require('express');
const { pool } = require('../config/db');
const availabilityService = require('../services/availability.service');

const router = express.Router();

function positiveInteger(value, label) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    const error = new Error(`${label} phải là số nguyên dương.`);
    error.statusCode = 400;
    throw error;
  }

  return Number(value);
}

router.get('/sport-types', async (req, res) => {
  const [sportTypes] = await pool.execute(
    'SELECT id, name, description FROM sport_types ORDER BY id',
  );

  res.json({ ok: true, data: sportTypes });
});

router.get('/fields/available', async (req, res) => {
  const sportTypeId = positiveInteger(req.query.sportTypeId, 'ID loại hình');
  const fields = await availabilityService.findAvailableFields(
    sportTypeId,
    req.query.date,
    req.query.start,
    req.query.end,
  );

  res.json({ ok: true, data: fields });
});

router.get('/fields/:id/schedule', async (req, res) => {
  const fieldId = positiveInteger(req.params.id, 'ID sân');
  const schedule = await availabilityService.getFieldSchedule(fieldId, req.query.date);

  res.json({ ok: true, data: schedule });
});

router.get('/fields', async (req, res) => {
  const { sportTypeId } = req.query;
  const params = [];
  let query = `
    SELECT f.id, f.name, f.sport_type_id, f.description, f.image_url, f.status,
           st.name AS sport_type_name
    FROM fields f
    INNER JOIN sport_types st ON st.id = f.sport_type_id
    WHERE f.status = 'active'
  `;

  if (sportTypeId) {
    query += ' AND f.sport_type_id = ?';
    params.push(positiveInteger(sportTypeId, 'ID loại hình'));
  }

  query += ' ORDER BY f.id';

  const [fields] = await pool.execute(query, params);
  res.json({ ok: true, data: fields });
});

module.exports = router;