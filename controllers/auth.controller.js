const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_SPECIAL_CHARACTER = /[^\p{L}\p{N}\s]/u;
const SESSION_COOKIE_NAME = 'connect.sid';

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getPublicUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
  };
}

function regenerateSession(session) {
  return new Promise((resolve, reject) => {
    session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function saveSession(session) {
  return new Promise((resolve, reject) => {
    session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function register(req, res, next) {
  try {
    const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!fullName) {
      throw createHttpError(400, 'Vui lòng nhập họ tên.');
    }

    if (!EMAIL_PATTERN.test(email)) {
      throw createHttpError(400, 'Email không hợp lệ.');
    }

    if (password.length < 6) {
      throw createHttpError(400, 'Mật khẩu phải có ít nhất 6 ký tự.');
    }

    if (!PASSWORD_SPECIAL_CHARACTER.test(password)) {
      throw createHttpError(400, 'Mật khẩu phải chứa ít nhất một ký tự đặc biệt.');
    }

    const [existingUsers] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [
      email,
    ]);
    if (existingUsers.length > 0) {
      throw createHttpError(409, 'Email này đã được đăng ký.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [fullName, email, passwordHash, 'customer'],
    );

    res.status(201).json({
      ok: true,
      data: {
        user: {
          id: result.insertId,
          fullName,
          email,
          role: 'customer',
        },
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      next(createHttpError(409, 'Email này đã được đăng ký.'));
      return;
    }

    next(error);
  }
}

async function login(req, res, next) {
  try {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const [users] = await pool.execute(
      'SELECT id, full_name, email, password_hash, role FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    const user = users[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw createHttpError(401, 'Email hoặc mật khẩu không đúng.');
    }

    await regenerateSession(req.session);
    req.session.userId = user.id;
    req.session.role = user.role;
    await saveSession(req.session);

    res.json({ ok: true, data: { user: getPublicUser(user) } });
  } catch (error) {
    next(error);
  }
}

async function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }

    res.clearCookie(SESSION_COOKIE_NAME, { httpOnly: true });
    res.json({ ok: true, data: { message: 'Đăng xuất thành công.' } });
  });
}

async function me(req, res, next) {
  try {
    const [users] = await pool.execute(
      'SELECT id, full_name, email, role FROM users WHERE id = ? LIMIT 1',
      [req.session.userId],
    );
    const user = users[0];

    if (!user) {
      req.session.destroy((error) => {
        if (error) {
          next(error);
          return;
        }

        next(createHttpError(401, 'Phiên đăng nhập không còn hợp lệ.'));
      });
      return;
    }

    res.json({ ok: true, data: { user: getPublicUser(user) } });
  } catch (error) {
    next(error);
  }
}

module.exports = { register, login, logout, me };
