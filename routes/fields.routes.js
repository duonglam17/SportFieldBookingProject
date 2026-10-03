const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

router.get('/sport-types', async (req, res) => {
  const [sportTypes] = await pool.execute(
    'SELECT id, name, description FROM sport_types ORDER BY id',
  );

  res.json({ ok: true, data: sportTypes });
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
    params.push(sportTypeId);
  }

  query += ' ORDER BY f.id';

  const [fields] = await pool.execute(query, params);
  res.json({ ok: true, data: fields });
});

module.exports = router;