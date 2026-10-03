const bcrypt = require('bcrypt');
const express = require('express');
const session = require('express-session');
const request = require('supertest');

jest.mock('../config/db', () => ({
  pool: {
    execute: jest.fn(),
  },
}));

const { pool } = require('../config/db');
const authRoutes = require('../routes/auth.routes');
const { requireRole } = require('../middleware/auth');
const errorHandler = require('../middleware/errorHandler');

let users;
let app;

function createApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(
    session({
      secret: 'test-session-secret',
      resave: false,
      saveUninitialized: false,
    }),
  );
  testApp.use('/api/auth', authRoutes);
  testApp.get('/api/staff', requireRole('staff', 'admin'), (req, res) => {
    res.json({ ok: true, data: { role: req.session.role } });
  });
  testApp.use(errorHandler);
  return testApp;
}

beforeEach(async () => {
  users = [
    {
      id: 1,
      full_name: 'Quản trị viên mẫu',
      email: 'admin@example.com',
      password_hash: await bcrypt.hash('123456', 10),
      role: 'admin',
    },
  ];
  pool.execute.mockImplementation(async (query, params = []) => {
    if (query.startsWith('SELECT id FROM users WHERE email')) {
      return [users.filter((user) => user.email === params[0]).map(({ id }) => ({ id }))];
    }

    if (query.startsWith('SELECT id, full_name, email, password_hash, role FROM users')) {
      return [users.filter((user) => user.email === params[0])];
    }

    if (query.startsWith('SELECT id, full_name, email, role FROM users WHERE id')) {
      return [users.filter((user) => user.id === params[0])];
    }

    if (query.startsWith('INSERT INTO users')) {
      const user = {
        id: users.length + 1,
        full_name: params[0],
        email: params[1],
        password_hash: params[2],
        role: params[3],
      };
      users.push(user);
      return [{ insertId: user.id }];
    }

    throw new Error(`Unexpected query in test: ${query}`);
  });
  app = createApp();
});

afterEach(() => {
  pool.execute.mockReset();
});

test('rejects passwords without a special character', async () => {
  const response = await request(app).post('/api/auth/register').send({
    fullName: 'Người dùng',
    email: 'new@example.com',
    password: 'abcdef',
    role: 'admin',
  });

  expect(response.status).toBe(400);
  expect(response.body).toEqual({
    ok: false,
    error: 'Mật khẩu phải chứa ít nhất một ký tự đặc biệt.',
  });
  expect(pool.execute).not.toHaveBeenCalled();
});

test('registers the account as customer and stores a bcrypt hash', async () => {
  const response = await request(app).post('/api/auth/register').send({
    fullName: 'Người dùng mới',
    email: ' New@Example.com ',
    password: 'abcde!',
    role: 'admin',
  });

  expect(response.status).toBe(201);
  expect(response.body.data.user).toMatchObject({
    fullName: 'Người dùng mới',
    email: 'new@example.com',
    role: 'customer',
  });
  expect(await bcrypt.compare('abcde!', users[1].password_hash)).toBe(true);
  expect(users[1].role).toBe('customer');
});

test('uses the same login error for an unknown email and a wrong password', async () => {
  const unknownEmail = await request(app).post('/api/auth/login').send({
    email: 'unknown@example.com',
    password: '123456',
  });
  const wrongPassword = await request(app).post('/api/auth/login').send({
    email: 'admin@example.com',
    password: 'wrong!',
  });

  expect(unknownEmail.status).toBe(401);
  expect(wrongPassword.status).toBe(401);
  expect(unknownEmail.body.error).toBe('Email hoặc mật khẩu không đúng.');
  expect(wrongPassword.body.error).toBe('Email hoặc mật khẩu không đúng.');
});

test('logs in a seeded account, returns its profile from me, and logs out', async () => {
  const agent = request.agent(app);
  const loginResponse = await agent.post('/api/auth/login').send({
    email: 'admin@example.com',
    password: '123456',
  });

  expect(loginResponse.status).toBe(200);
  expect(loginResponse.body.data.user).toMatchObject({
    id: 1,
    email: 'admin@example.com',
    role: 'admin',
  });

  const meResponse = await agent.get('/api/auth/me');
  expect(meResponse.status).toBe(200);
  expect(meResponse.body.data.user.fullName).toBe('Quản trị viên mẫu');

  const roleResponse = await agent.get('/api/staff');
  expect(roleResponse.status).toBe(200);
  expect(roleResponse.body.data.role).toBe('admin');

  const logoutResponse = await agent.post('/api/auth/logout');
  expect(logoutResponse.status).toBe(200);
  expect((await agent.get('/api/auth/me')).status).toBe(401);
});

test('requires login for me and role-protected endpoints', async () => {
  expect((await request(app).get('/api/auth/me')).status).toBe(401);
  expect((await request(app).get('/api/staff')).status).toBe(401);
});
