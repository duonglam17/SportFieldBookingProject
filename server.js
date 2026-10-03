require('dotenv').config();

process.env.TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';

const express = require('express');
const session = require('express-session');
const errorHandler = require('./middleware/errorHandler');
const fieldsRoutes = require('./routes/fields.routes');
const authRoutes = require('./routes/auth.routes');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
    },
  }),
);

app.use(express.static('public'));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api', fieldsRoutes);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`);
});
