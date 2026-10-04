const express = require('express');
const request = require('supertest');
const createLoginRateLimiter = require('../middleware/loginRateLimit');

test('limits repeated failed logins and allows attempts again after the window expires', async () => {
  let now = 1_000_000;
  const app = express();
  app.use(express.json());
  app.post(
    '/login',
    createLoginRateLimiter({
      windowMs: 60_000,
      maxFailures: 2,
      now: () => now,
    }),
    (req, res) => {
      res.status(req.body.password === 'correct' ? 200 : 401).json({ ok: false });
    },
  );

  expect((await request(app).post('/login').send({ password: 'wrong' })).status).toBe(401);
  expect((await request(app).post('/login').send({ password: 'wrong' })).status).toBe(401);
  const limited = await request(app).post('/login').send({ password: 'wrong' });
  expect(limited.status).toBe(429);
  expect(limited.headers['retry-after']).toBe('60');

  now += 60_001;
  expect((await request(app).post('/login').send({ password: 'wrong' })).status).toBe(401);
});

test('successful login clears prior failures for that address', async () => {
  const app = express();
  app.use(express.json());
  app.post(
    '/login',
    createLoginRateLimiter({ windowMs: 60_000, maxFailures: 2 }),
    (req, res) => {
      res.status(req.body.password === 'correct' ? 200 : 401).json({ ok: false });
    },
  );

  expect((await request(app).post('/login').send({ password: 'wrong' })).status).toBe(401);
  expect((await request(app).post('/login').send({ password: 'correct' })).status).toBe(200);
  expect((await request(app).post('/login').send({ password: 'wrong' })).status).toBe(401);
  expect((await request(app).post('/login').send({ password: 'wrong' })).status).toBe(401);
  expect((await request(app).post('/login').send({ password: 'wrong' })).status).toBe(429);
});
