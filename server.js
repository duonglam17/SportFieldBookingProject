require('dotenv').config();

process.env.TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const errorHandler = require('./middleware/errorHandler');
const fieldsRoutes = require('./routes/fields.routes');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const adminBookingRoutes = require('./routes/admin-bookings.routes');
const adminBlockedSlotsRoutes = require('./routes/admin-blocked-slots.routes');
const adminStatsRoutes = require('./routes/admin-stats.routes');
const bookingRoutes = require('./routes/bookings.routes');
const { startExpiryJob } = require('./services/expiry.job');

const app = express();
const port = Number(process.env.PORT || 3000);

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      },
    },
  }),
);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

app.use(express.static('public'));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api', fieldsRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin/bookings', adminBookingRoutes);
app.use('/api/admin/blocked-slots', adminBlockedSlotsRoutes);
app.use('/api/admin/stats', adminStatsRoutes);
app.use('/api/admin', adminRoutes);
app.use(errorHandler);

startExpiryJob();

app.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`);
});
