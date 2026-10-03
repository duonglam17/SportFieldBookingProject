const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

router.get('/sport-types', async (req, res) => {
  const [sportTypes] = await pool.execute(
    'SELECT id, name, description FROM sport_types ORDER BY id',
  );

  res.json({ ok: true, data: sportTypes });
});

module.exports = router;