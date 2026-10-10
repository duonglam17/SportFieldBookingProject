# ⚽ Sport Booking – Website Quản lý & Đặt sân thể thao

## Mục lục

- [1. Giới thiệu](#1-giới-thiệu)
- [2. Công nghệ sử dụng](#2-công-nghệ-sử-dụng)
- [3. Phạm vi MVP](#3-phạm-vi-mvp)
- [4. Thiết kế cơ sở dữ liệu](#4-thiết-kế-cơ-sở-dữ-liệu)
- [5. Cấu trúc thư mục](#5-cấu-trúc-thư-mục)
- [6. Danh sách API](#6-danh-sách-api)
- [7. Chạy ứng dụng cục bộ với XAMPP](#7-chạy-ứng-dụng-cục-bộ-với-xampp)
- [8. Danh sách công việc](#8-danh-sách-công-việc)
- [9. Quy trình xây dựng hệ thống với Agent](#9-quy-trình-xây-dựng-hệ-thống-với-agent)
- [10. Bản đồ tính năng và cách sửa](#10-bản-đồ-tính-năng-và-cách-sửa)
- [11. Skills và công cụ hỗ trợ](#11-skills-và-công-cụ-hỗ-trợ)
- [12. Kiểm thử kết hợp nhiều công cụ](#12-kiểm-thử-kết-hợp-nhiều-công-cụ)

Website cho phép người chơi xem lịch trống và đặt sân (bóng đá mini, cầu lông, tennis, bóng rổ...) theo khung giờ, đồng thời giúp chủ sân/nhân viên quản lý sân, lịch đặt, giá theo giờ và xem thống kê doanh thu.

---

## 1. Giới thiệu

### Vấn đề
Nhiều cụm sân nhỏ vẫn nhận đặt sân qua điện thoại, Zalo hoặc ghi sổ. Hậu quả là dễ đặt trùng giờ, khó biết sân nào còn trống, khó theo dõi tiền cọc và doanh thu.

### Giải pháp
Một hệ thống web có hai phía:
- **Người chơi:** chọn môn thể thao và ngày, xem bảng lịch trống của từng sân, đặt khung giờ mong muốn, xem và hủy lịch của mình.
- **Chủ sân / nhân viên:** quản lý sân và bảng giá, xử lý lịch đặt, khóa sân khi bảo trì, xem báo cáo.

### Mục tiêu học tập
- Xây dựng REST API với Node.js + Express
- Thiết kế cơ sở dữ liệu quan hệ trên MySQL (XAMPP)
- Xử lý logic nghiệp vụ khó: chống trùng khung giờ, tính giá theo giờ cao điểm/thấp điểm
- Xây dựng giao diện lịch dạng lưới (timetable) bằng HTML/CSS/JS thuần
- Xác thực, phân quyền và viết kiểm thử cho các ca biên

---

## 2. Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Backend | Node.js + Express |
| Frontend | HTML, CSS, JavaScript thuần (gọi API bằng `fetch`) |
| Database | MySQL/MariaDB chạy bằng **XAMPP**, quản lý qua phpMyAdmin |
| Thư viện kết nối DB | `mysql2` |
| Mã hóa mật khẩu | `bcrypt` |
| Phiên đăng nhập / HTTP headers | `express-session`, `helmet` |
| Biến môi trường | `dotenv` |
| Kiểm thử | `jest` + `supertest` |
| Công cụ dev | Node.js `--watch` |

---

## 3. Phạm vi MVP

### Có trong bản đầu
1. Đăng ký, đăng nhập, đăng xuất; 3 vai trò: `customer`, `staff`, `admin`
2. Quản lý loại hình thể thao, sân và bảng giá theo khung giờ (CRUD)
3. Xem lịch trống của từng sân theo ngày (dạng lưới giờ)
4. Đặt sân theo khoảng giờ liên tiếp (ví dụ 18:00-20:00), xem lịch sử, hủy lịch
5. Nhân viên xem danh sách lịch đặt, xác nhận, đánh dấu đã chơi / không đến, hủy
6. Khóa sân theo khung giờ (bảo trì, giải đấu nội bộ)
7. Thống kê cơ bản theo tháng: doanh thu, số lượt đặt, giờ cao điểm

### Chưa làm ở bản đầu
- Thanh toán online thật (chỉ ghi nhận `unpaid` / `deposit_paid` / `paid`)
- Gửi email/SMS/Zalo tự động
- Nhiều cụm sân, nhiều chủ sân
- Đặt lịch lặp lại hằng tuần
- Ghép kèo, tìm đội
- Upload ảnh sân (bản đầu dùng đường dẫn ảnh có sẵn)

---

## 4. Thiết kế cơ sở dữ liệu

### Sơ đồ quan hệ
```
users 1 ──── n bookings n ──── 1 fields n ──── 1 sport_types 1 ──── n price_rules
                                  │
                                  └── 1 ──── n blocked_slots
```

### Script tạo database
Mở phpMyAdmin → tab **SQL** → dán và chạy:

```sql
CREATE DATABASE IF NOT EXISTS sport_booking
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sport_booking;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer','staff','admin') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sport_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,      -- Bóng đá mini 5 người, Cầu lông, Tennis...
  description TEXT
);

CREATE TABLE fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,      -- Sân A1, Sân cầu lông số 3...
  sport_type_id INT NOT NULL,
  description TEXT,
  image_url VARCHAR(255),
  status ENUM('active','maintenance') NOT NULL DEFAULT 'active',
  FOREIGN KEY (sport_type_id) REFERENCES sport_types(id)
);

-- Giá theo loại hình, ngày thường/cuối tuần và khung giờ
CREATE TABLE price_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sport_type_id INT NOT NULL,
  day_type ENUM('weekday','weekend') NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  price_per_hour DECIMAL(12,0) NOT NULL,
  FOREIGN KEY (sport_type_id) REFERENCES sport_types(id),
  CHECK (end_time > start_time)
);

CREATE TABLE bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  field_id INT NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  total_price DECIMAL(12,0) NOT NULL,
  status ENUM('pending','confirmed','completed','no_show','cancelled')
    NOT NULL DEFAULT 'pending',
  payment_status ENUM('unpaid','deposit_paid','paid') NOT NULL DEFAULT 'unpaid',
  note VARCHAR(255),
  expires_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (field_id) REFERENCES fields(id),
  CHECK (end_time > start_time)
);

CREATE INDEX idx_bookings_field_date ON bookings(field_id, booking_date, start_time, end_time);

-- Khóa sân (bảo trì, giải đấu...)
CREATE TABLE blocked_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  field_id INT NOT NULL,
  block_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  reason VARCHAR(255),
  created_by INT,
  FOREIGN KEY (field_id) REFERENCES fields(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  CHECK (end_time > start_time)
);

CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  amount DECIMAL(12,0) NOT NULL,
  type ENUM('deposit','balance','refund') NOT NULL,
  method VARCHAR(50),
  note VARCHAR(255),
  recorded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);
```

### Quy ước thời gian
- Giờ mở cửa và đóng cửa đặt trong `.env` (`OPEN_TIME=06:00`, `CLOSE_TIME=22:00`).
- Mỗi lượt đặt là các **khung 1 giờ liên tiếp**, bắt đầu và kết thúc đúng giờ chẵn (06:00, 07:00...).
- Một lượt đặt không được qua nửa đêm; `end_time` luôn lớn hơn `start_time` trong cùng một ngày.
- Mọi so sánh ngày giờ ("không đặt trong quá khứ", "hủy trước 2 giờ") dùng giờ của server, nên đặt múi giờ Việt Nam khi chạy.

### Truy vấn lõi: kiểm tra sân trống
Hai khoảng giờ cùng ngày chồng lấn khi `start_cũ < end_mới` **và** `end_cũ > start_mới`. Lượt đặt này kết thúc 18:00 và lượt khác bắt đầu 18:00 là **hợp lệ**.

```sql
SELECT f.*
FROM fields f
WHERE f.status = 'active'
  AND f.sport_type_id = ?
  AND f.id NOT IN (
    SELECT field_id FROM bookings
    WHERE booking_date = ?
      AND status IN ('pending','confirmed')
      AND start_time < ?            -- end_time mới
      AND end_time   > ?            -- start_time mới
  )
  AND f.id NOT IN (
    SELECT field_id FROM blocked_slots
    WHERE block_date = ?
      AND start_time < ?            -- end_time mới
      AND end_time   > ?            -- start_time mới
  );
```

### Truy vấn lịch của một sân trong ngày (để vẽ lưới giờ)
```sql
SELECT start_time, end_time, 'booked'  AS type FROM bookings
 WHERE field_id = ? AND booking_date = ? AND status IN ('pending','confirmed')
UNION ALL
SELECT start_time, end_time, 'blocked' AS type FROM blocked_slots
 WHERE field_id = ? AND block_date = ?;
```
Backend trả về danh sách khoảng bận, frontend tô màu các ô giờ tương ứng.

### Tính giá
Với mỗi khung 1 giờ trong lượt đặt, tìm dòng `price_rules` khớp `sport_type_id`, `day_type` (thứ 7, chủ nhật = `weekend`) và giờ bắt đầu nằm trong `[start_time, end_time)`. Tổng tiền là tổng giá các khung giờ. Nếu một khung giờ không khớp quy tắc giá nào thì từ chối đặt và báo lỗi cấu hình.

### Chống đặt trùng khi hai người đặt cùng lúc
Khi tạo lượt đặt, dùng **transaction** và khóa hàng của sân:

```
1. START TRANSACTION
2. SELECT id FROM fields WHERE id = ? FOR UPDATE
3. Kiểm tra lại khung giờ còn trống (cả bookings và blocked_slots)
4. Nếu còn trống: INSERT vào bookings
5. COMMIT (hoặc ROLLBACK và trả lỗi 409 nếu đã bị đặt)
```

Chỉ kiểm tra ở giao diện là không đủ.

### Vòng đời lượt đặt
```
pending → confirmed → completed
   │          ├──────→ no_show
   └──────────┴──────→ cancelled
```
- `pending`: khách vừa đặt, chờ nhân viên xác nhận (hoặc xác nhận sau khi nhận cọc).
- `completed` / `no_show`: chỉ đặt được sau khi đã qua giờ bắt đầu.
- Chính sách hủy (đặt trong `.env`): khách chỉ được tự hủy khi còn ít nhất `CANCEL_BEFORE_HOURS=2` giờ trước giờ bắt đầu.

### Giữ chỗ và thanh toán
- Khi khách xác nhận đặt sân, hệ thống tạo lượt `pending` và đặt `expires_at` bằng thời điểm hiện tại cộng `HOLD_MINUTES`. Tác vụ nền chạy mỗi phút, chuyển lượt `pending` hết hạn thành `cancelled`; các lượt đó không còn giữ chỗ.
- Tiền cọc gợi ý được tính phía máy chủ theo `DEPOSIT_PERCENT`, làm tròn lên hàng nghìn. Chuyển khoản không được xác nhận tự động; nhân viên ghi nhận khoản `deposit` trong trang quản lý rồi mới có thể xác nhận lượt.
- Bảng `payments` lưu riêng từng khoản `deposit`, `balance` và `refund`. Doanh thu thống kê theo ngày ghi nhận là tổng cọc + phần còn lại − khoản hoàn tiền đã ghi nhận.
- Nếu khách hủy lượt đã cọc đủ sớm, hệ thống ghi yêu cầu hoàn tiền (`refund` với `recorded_by = NULL`); nhân viên xác nhận khoản hoàn sau. Hủy sát hơn `REFUND_FULL_BEFORE_HOURS` không tạo yêu cầu hoàn cọc.

### Cấu hình môi trường
Sao chép `.env.example` thành `.env` rồi điều chỉnh:

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng chạy Express (mặc định `3000`) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Kết nối MySQL của XAMPP |
| `SESSION_SECRET` | Chuỗi bí mật dài, ngẫu nhiên để ký session |
| `TZ` | Múi giờ máy chủ, dùng `Asia/Ho_Chi_Minh` |
| `OPEN_TIME`, `CLOSE_TIME` | Giờ hoạt động trong ngày |
| `MAX_HOURS_PER_BOOKING`, `MAX_DAYS_AHEAD` | Giới hạn thời lượng và ngày đặt xa nhất |
| `HOLD_MINUTES` | Số phút giữ một lượt `pending` |
| `DEPOSIT_PERCENT` | Tỉ lệ cọc gợi ý |
| `CANCEL_BEFORE_HOURS`, `REFUND_FULL_BEFORE_HOURS` | Giới hạn tự hủy và điều kiện hoàn cọc |
| `LOGIN_RATE_LIMIT_WINDOW_MS`, `LOGIN_RATE_LIMIT_MAX_FAILURES` | Cửa sổ giới hạn và số lần đăng nhập sai theo địa chỉ IP |
| `TRUST_PROXY` | Đặt `1` sau đúng một reverse proxy đáng tin cậy; mặc định `0` |

Trong production, phục vụ ứng dụng qua HTTPS để cookie session được đặt `Secure`. Nếu TLS kết thúc ở reverse proxy, chỉ đặt `TRUST_PROXY=1` khi ứng dụng chỉ nhận lưu lượng từ proxy đó.

---

## 5. Cấu trúc thư mục

```
sport-booking/
├── server.js                 # điểm khởi động Express
├── package.json
├── .env                      # KHÔNG commit
├── .env.example
├── .gitignore
├── config/
│   └── db.js                 # pool kết nối MySQL
├── middleware/
│   ├── auth.js               # requireLogin, requireRole(...)
│   └── errorHandler.js
├── routes/
│   ├── auth.routes.js
│   ├── fields.routes.js
│   ├── bookings.routes.js
│   └── admin.routes.js
├── controllers/
├── services/
│   ├── availability.service.js   # kiểm tra trống, chồng lấn khung giờ
│   ├── pricing.service.js        # tính giá theo khung giờ
│   └── booking.service.js        # transaction đặt sân, hủy, đổi trạng thái
├── sql/
│   ├── schema.sql
│   └── seed.sql              # dữ liệu mẫu
├── public/                   # frontend tĩnh
│   ├── index.html            # trang chủ: chọn môn, chọn ngày
│   ├── schedule.html         # lưới lịch trống các sân theo ngày
│   ├── booking.html          # xác nhận đặt sân
│   ├── my-bookings.html
│   ├── login.html
│   ├── register.html
│   ├── admin/
│   │   ├── dashboard.html
│   │   ├── fields.html       # quản lý sân, bảng giá
│   │   ├── bookings.html     # quản lý lượt đặt
│   │   └── blocked.html      # khóa sân
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── api.js            # hàm fetch dùng chung
│       ├── schedule.js       # vẽ lưới giờ
│       └── admin.js
└── tests/
    ├── availability.test.js
    ├── pricing.test.js
    └── booking.test.js
```

---

## 6. Danh sách API

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/auth/register` | công khai | Đăng ký |
| POST | `/api/auth/login` | công khai | Đăng nhập |
| POST | `/api/auth/logout` | đã đăng nhập | Đăng xuất |
| GET | `/api/auth/me` | đã đăng nhập | Thông tin người dùng hiện tại |
| GET | `/api/sport-types` | công khai | Danh sách loại hình thể thao |
| GET | `/api/fields?sportTypeId=` | công khai | Danh sách sân |
| GET | `/api/fields/:id/schedule?date=YYYY-MM-DD` | công khai | Khoảng giờ đã bận của sân trong ngày |
| GET | `/api/fields/available?sportTypeId=&date=&start=&end=` | công khai | Sân còn trống trong khoảng giờ |
| GET | `/api/price?sportTypeId=&date=&start=&end=` | công khai | Báo giá khoảng giờ |
| POST | `/api/bookings` | customer | Đặt sân |
| GET | `/api/bookings/mine` | customer | Lịch đặt của tôi |
| PATCH | `/api/bookings/:id/cancel` | customer | Hủy lịch của mình |
| GET | `/api/admin/bookings?status=&date=` | staff, admin | Danh sách lượt đặt |
| PATCH | `/api/admin/bookings/:id/status` | staff, admin | Xác nhận / hoàn tất / không đến / hủy |
| POST | `/api/admin/bookings/:id/payments` | staff, admin | Ghi nhận khoản cọc / thanh toán / hoàn tiền |
| GET | `/api/admin/blocked-slots?date=&fieldId=` | staff, admin | Danh sách khung giờ khóa |
| POST | `/api/admin/blocked-slots` | staff, admin | Tạo khóa sân; từ chối và trả lượt đặt xung đột |
| DELETE | `/api/admin/blocked-slots/:id` | staff, admin | Mở khóa sân |
| GET | `/api/admin/blocked-slots/schedule?date=` | staff, admin | Lịch tổng tất cả sân trong ngày |
| GET | `/api/admin/stats?month=YYYY-MM` | admin | Doanh thu, trạng thái, tỉ lệ không đến, khung giờ và lượt đặt theo sân |
| POST/PUT/DELETE | `/api/admin/sport-types`, `/fields`, `/price-rules` | admin | Quản lý sân và bảng giá |

---

## 7. Chạy ứng dụng cục bộ với XAMPP

1. Cài Node.js LTS và XAMPP; trong XAMPP Control Panel bật **MySQL** (và Apache nếu dùng phpMyAdmin).
2. Mở `http://localhost/phpmyadmin`. Nếu database/bảng chưa có, chạy `sql/schema.sql` một lần trong tab **SQL**. Không chạy lại schema trên database đã có các bảng.
3. Chọn database `sport_booking`, mở tab **Import**, chọn `sql/seed.sql` và nhấn **Import** để thêm dữ liệu học tập mẫu.
4. Tại thư mục dự án, sao chép cấu hình mẫu trong PowerShell: `Copy-Item .env.example .env`. Cấu hình mặc định dùng `localhost:3306`, user `root`, mật khẩu rỗng, phù hợp với XAMPP local thường dùng.
5. Cài dependencies và khởi động:

   ```powershell
   npm install
   npm run dev
   ```

6. Mở `http://localhost:3000`. Chạy test bằng `npm test`.

### Tài khoản demo (chỉ dùng học tập local)
Tất cả tài khoản mẫu trong `sql/seed.sql` có mật khẩu `123456`:

| Vai trò | Email |
|---|---|
| Admin | `admin@example.com` |
| Staff | `staff@example.com` |
| Customer | `customer1@example.com`, `customer2@example.com`, `customer3@example.com` |

Không dùng các tài khoản này trong môi trường thật. Đổi hoặc xóa tài khoản demo trước khi triển khai công khai.

---

## 8. Danh sách công việc

### Giai đoạn 0 – Chuẩn bị 
- [ ] Cài Node.js (bản LTS) và XAMPP
- [ ] Tạo repo GitHub, thêm `.gitignore` (`node_modules`, `.env`)
- [ ] Mở XAMPP, bật **Apache** và **MySQL**, vào `http://localhost/phpmyadmin`
- [ ] Chốt các môn thể thao, số sân, giờ mở/đóng cửa, bảng giá mẫu (giờ thường, giờ cao điểm 17:00-21:00, cuối tuần)

### Giai đoạn 1 – Khởi tạo dự án 
- [ ] `npm init -y`, cài `express mysql2 bcrypt express-session dotenv`
- [ ] Cài dev: `jest supertest` (tự khởi động lại bằng `node --watch`)
- [ ] Tạo cấu trúc thư mục ở mục 5
- [ ] Viết `server.js` chạy được, phục vụ thư mục `public/`
- [ ] Commit đầu tiên

### Giai đoạn 2 – Cơ sở dữ liệu 
- [ ] Chạy script ở mục 4 trong phpMyAdmin, lưu vào `sql/schema.sql`
- [ ] Viết `config/db.js` dùng `mysql2/promise` với connection pool
- [ ] Viết `sql/seed.sql`: 3-4 loại hình, 8-12 sân, bảng giá, 1 admin, 1 nhân viên, vài khách
- [ ] Viết route thử `/api/sport-types` trả dữ liệu từ DB

### Giai đoạn 3 – Xác thực và phân quyền 
- [ ] Đăng ký: kiểm tra email trùng, băm mật khẩu bằng bcrypt
- [ ] Đăng nhập, lưu `userId` và `role` trong session
- [ ] Middleware `requireLogin` và `requireRole('staff','admin')`
- [ ] Trang `login.html`, `register.html`
- [ ] Thanh điều hướng đổi theo trạng thái đăng nhập và vai trò

### Giai đoạn 4 – Quản lý sân và bảng giá 
- [ ] API CRUD loại hình thể thao, sân, quy tắc giá (chỉ admin)
- [ ] Kiểm tra bảng giá: các khung giờ không chồng nhau, phủ kín giờ mở cửa
- [ ] Không cho xóa sân đang có lượt đặt, thay vào đó chuyển sang `maintenance`
- [ ] Trang `admin/fields.html`: bảng sân, form thêm/sửa, quản lý giá

### Giai đoạn 5 – Lịch trống 
- [ ] Hàm `isRangeFree(fieldId, date, start, end)` dùng truy vấn chồng lấn (kiểm tra cả `blocked_slots`)
- [ ] Kiểm tra đầu vào: định dạng ngày/giờ, giờ nằm trong giờ mở cửa, `end > start`, không đặt trong quá khứ, giới hạn số giờ tối đa mỗi lượt
- [ ] Trang `index.html`: chọn môn thể thao và ngày
- [ ] Trang `schedule.html`: lưới giờ cho từng sân (ô trống / đã đặt / bị khóa), bấm chọn khoảng giờ liên tiếp
- [ ] Hiển thị báo giá ngay khi chọn khoảng giờ

### Giai đoạn 6 – Đặt sân 
- [ ] `pricing.service.js`: tính tiền theo từng khung giờ, ngày thường/cuối tuần
- [ ] Tạo lượt đặt bằng **transaction + `SELECT ... FOR UPDATE`** như mục 4
- [ ] Giá luôn tính lại ở server, không nhận từ client
- [ ] Trang `booking.html`: xem lại thông tin, ghi chú, bấm xác nhận
- [ ] Trang `my-bookings.html`: lịch của khách, tách "sắp tới" và "đã qua"
- [ ] Khách hủy được khi còn ít nhất `CANCEL_BEFORE_HOURS` giờ trước giờ bắt đầu
- [ ] Thử mở hai tab đặt cùng một khung giờ để kiểm tra không bị trùng

### Giai đoạn 7 – Trang quản lý cho nhân viên
- [ ] Trang `admin/bookings.html`: bảng lượt đặt, lọc theo ngày, sân, trạng thái
- [ ] Nút chuyển trạng thái: xác nhận → hoàn tất / không đến / hủy
- [ ] Chặn chuyển trạng thái sai (ví dụ từ `cancelled` sang `confirmed`, hoàn tất lượt chưa diễn ra)
- [ ] Cập nhật thanh toán: chưa thanh toán / đã cọc / đã thanh toán
- [x] Trang `admin/blocked.html`: khóa sân theo ngày và khung giờ; không cho khóa trùng lượt đã có khách (phải xử lý lượt đó trước)
- [x] Xem lịch tổng của tất cả sân trong ngày

### Giai đoạn 8 – Thống kê 
- [ ] API `/api/admin/stats`: doanh thu theo ngày trong tháng, số lượt theo trạng thái, tỉ lệ không đến
- [ ] Khung giờ được đặt nhiều nhất, sân được đặt nhiều nhất
- [ ] Trang `admin/dashboard.html`: các thẻ số liệu và biểu đồ (Chart.js qua CDN)

### Giai đoạn 9 – Giao diện và hoàn thiện
- [x] CSS dùng chung trong `style.css`, dùng biến CSS cho màu sắc
- [x] Lưới giờ dùng được trên điện thoại (cuộn ngang trong khung riêng)
- [x] Thông báo lỗi và thành công rõ ràng, trạng thái đang tải, danh sách rỗng
- [x] Xử lý lỗi tập trung bằng `errorHandler.js`

### Giai đoạn 10 – Kiểm thử 
- [ ] Unit test: kiểm tra chồng lấn khoảng giờ, tính giá, quy đổi ngày thường/cuối tuần
- [ ] Test ca biên của đặt sân:
  - [ ] Lượt A kết thúc 18:00, lượt B bắt đầu 18:00 (phải cho phép)
  - [ ] Hai lượt chồng lấn một phần (phải từ chối)
  - [ ] Khung giờ nằm hoàn toàn trong lượt đã có
  - [ ] `start` bằng `end`, hoặc `end` trước `start`
  - [ ] Giờ ngoài giờ mở cửa
  - [ ] Đặt giờ đã qua trong ngày hôm nay
  - [ ] Lượt đặt kéo dài qua hai mức giá (ví dụ 16:00-18:00 qua mốc cao điểm 17:00)
  - [ ] Đặt vào cuối tuần so với ngày thường
  - [ ] Sân đang `maintenance` hoặc khung giờ bị khóa
  - [ ] Hủy sát giờ (dưới `CANCEL_BEFORE_HOURS`)
  - [ ] Đặt cho ngày xa quá giới hạn cho phép
- [ ] Test API bằng `supertest`: đăng nhập, đặt sân, hủy
- [ ] Test phân quyền: khách không truy cập được `/api/admin/*`, khách A không hủy được lượt của khách B
- [ ] Test hai yêu cầu đặt cùng một khung giờ cùng lúc, chỉ một yêu cầu thành công

### Giai đoạn 11 – Bảo mật và tài liệu
- [x] Truy vấn dùng placeholders `?` cho dữ liệu đầu vào; mệnh đề SQL động chỉ được ghép từ các điều kiện cố định
- [x] Dữ liệu động được render bằng `textContent`/DOM APIs, không chèn dữ liệu người dùng bằng HTML
- [x] Cookie session đặt `httpOnly`, `sameSite`; cookie `Secure` trong production; thêm `helmet` và giới hạn số lần đăng nhập sai
- [x] README có tài khoản demo, hướng dẫn chạy XAMPP, quy trình cọc/hoàn tiền và giữ chỗ hết hạn

---

## 9. Quy trình xây dựng hệ thống với Agent

### Quy trình và bằng chứng trong repo

1. **Viết đặc tả trước:** `README.md` mô tả phạm vi ở mục 3, schema và quy tắc nghiệp vụ ở mục 4, API ở mục 6, cấu trúc ở mục 5 và các giai đoạn ở mục 8.
2. **Quy ước chung:** repo có [.github/instructions.md](.github/instructions.md). Prompt khởi tạo trong [prompt.md](prompt.md) yêu cầu `.github/copilot-instructions.md`, nhưng file có trong repo mang tên `.github/instructions.md`; không có `.github/copilot-instructions.md`. Không thể khẳng định chỉ từ tên file rằng VS Code/Copilot tự nạp file này.
3. **Chia nhỏ yêu cầu:** `prompt.md` chứa các prompt đánh số 0–12 theo giai đoạn, kèm yêu cầu cụ thể và hướng xử lý khi gặp lỗi. File hiện là tệp chưa được Git theo dõi trong worktree.
4. **Sau mỗi prompt:** quy trình là chạy thử, đọc `git diff`, chạy test phù hợp rồi mới commit. `prompt.md` yêu cầu chạy thử/sửa lỗi trước khi sang prompt tiếp theo và commit sau prompt; lịch sử Git cho thấy commit theo từng phần. Commit log không chứng minh các lệnh kiểm tra đã chạy sau *từng* commit.
5. **Quyền terminal và khôi phục:** prompt hướng dẫn đọc lệnh trước khi cho phép chạy. Khi có thay đổi ngoài ý muốn, kiểm tra `git status`/`git diff` trước; `git restore <file>` khôi phục file được chọn. `git reset --hard <commit>` xóa thay đổi chưa commit và thay đổi lịch sử nhánh, chỉ dùng sau khi đã xác nhận đích và lưu lại phần cần giữ.

### Nhật ký làm việc với Agent

Các kết quả dưới đây được đối chiếu với subject và ngày trong `git log`; cột vấn đề chỉ ghi sự kiện có căn cứ từ lịch sử làm việc, nếu không thì để chỗ tự bổ sung.

| Giai đoạn/prompt | Kết quả | Vấn đề gặp | Cách tôi xử lý |
|---|---|---|---|
| Đặc tả ban đầu | README được khởi tạo (`8281d93`, 2026-10-02), sau đó bổ sung chi tiết dự án/API (`083f121`) và tiếp tục cập nhật (`f8a66f7`, 2026-10-04). | — | — |
| Prompt 0–1: quy ước và khởi tạo | Tạo cấu trúc Node/Express và `.github/instructions.md` (`9812999`, 2026-10-03). | Tên file hướng dẫn thực tế khác tên `.github/copilot-instructions.md` trong prompt. | Giữ đúng tên/tình trạng thực tế; chưa có file `copilot-instructions.md`. |
| Prompt 2: database | Schema, dữ liệu mẫu và kết nối MySQL (`870f97e`, 2026-10-03). | [TÔI ĐIỀN: vấn đề thực tế nếu có.] | [TÔI ĐIỀN: cách xử lý.] |
| Prompt 3: xác thực | Đăng ký, đăng nhập và phân quyền (`b14d600`, 2026-10-03). | [TÔI ĐIỀN: vấn đề thực tế nếu có.] | [TÔI ĐIỀN: cách xử lý.] |
| Prompt 4: quản trị sân | Trang quản lý sân và bảng giá (`9c75a53`, 2026-10-03). | [TÔI ĐIỀN: vấn đề thực tế nếu có.] | [TÔI ĐIỀN: cách xử lý.] |
| Prompt 5–6: khả dụng và lưới lịch | Dịch vụ khả dụng/test (`7ee80d8`) và giao diện lịch (`96b35f8`, 2026-10-03). | [TÔI ĐIỀN: vấn đề thực tế nếu có.] | [TÔI ĐIỀN: cách xử lý.] |
| Prompt 7: tính giá | Tính giá theo khung và test (`1da77d1`, 2026-10-04). | [TÔI ĐIỀN: vấn đề thực tế nếu có.] | [TÔI ĐIỀN: cách xử lý.] |
| Prompt 8: đặt sân | Transaction đặt sân, giữ chỗ hết hạn và hủy (`e5cd40d`, 2026-10-04). | [TÔI ĐIỀN: vấn đề thực tế nếu có.] | [TÔI ĐIỀN: cách xử lý.] |
| Prompt 9: lượt đặt và thanh toán | Quản lý lượt đặt và ghi nhận khoản thu (`1c0e5d7`, 2026-10-04). | [TÔI ĐIỀN: vấn đề thực tế nếu có.] | [TÔI ĐIỀN: cách xử lý.] |
| Prompt 10: khóa sân | Khóa sân và lịch tổng cho nhân viên/admin (`84af1dd`, 2026-10-04). | [TÔI ĐIỀN: vấn đề thực tế nếu có.] | [TÔI ĐIỀN: cách xử lý.] |
| Prompt 11: thống kê | Dashboard thống kê (`8edd0c7`, 2026-10-04). | [TÔI ĐIỀN: vấn đề thực tế nếu có.] | [TÔI ĐIỀN: cách xử lý.] |
| Prompt 12: giao diện và bảo mật | Rà soát giao diện/bảo mật và cập nhật tài liệu (`7ca0781`, 2026-10-04). | Audit dependency báo rủi ro trong chuỗi `nodemon`; không dùng `npm audit fix --force` vì có thể đổi major dev dependency. | Gỡ `nodemon`, dùng `node --watch server.js`; `package.json` hiện phản ánh cấu hình đó. |
| Prompt bổ sung: điều hướng theo vai trò | Chuyển hướng đăng nhập và thanh điều hướng quản trị (`b614edb`, 2026-10-04). | Đăng nhập admin trước đó không tự chuyển tới trang quản trị. | Bổ sung chuyển hướng theo role và redirect nội bộ; kiểm tra bằng browser với tài khoản admin/staff. |
| Sự cố môi trường (không xác minh được trong commit log) | Agent xin quyền tạo/import database: [TÔI ĐIỀN: đã xảy ra hay chưa]. PowerShell chặn `npm.ps1` và xử lý bằng `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`: [TÔI ĐIỀN: đã xảy ra hay chưa]. | Chưa có bằng chứng trong repo/log cho hai sự kiện trên. | [TÔI ĐIỀN: tình huống thực tế và cách xử lý.] |
| Cảnh báo line endings | Trong một số thay đổi có cảnh báo CRLF/LF; `git diff --check` được dùng để kiểm tra whitespace. | Khác biệt line ending có thể làm diff trông lớn hơn. | Xem diff trước khi commit; chỉ chuẩn hóa line ending nếu cần và trong phạm vi file liên quan. |

### Rủi ro khi dùng Agent và cách kiểm soát

- **Code sai nhưng vẫn chạy:** xem lại luồng dữ liệu, kiểm tra ca biên và chạy test phù hợp; không chỉ dựa vào việc server khởi động được.
- **Bảo mật:** tự rà soát đăng nhập/session, phân quyền, tham số SQL và dữ liệu đưa vào HTML; API phải kiểm tra quyền ở server.
- **Thay đổi ngoài phạm vi:** nêu rõ file/phạm vi và kiểm tra `git diff` để tránh nhận thay đổi không được yêu cầu.
- **Thư viện/phụ thuộc:** đọc lệnh và diff manifest trước khi cài/nâng cấp; tránh lệnh `--force` khi chưa hiểu tác động.

---

## 10. Bản đồ tính năng và cách sửa

### Tính năng → vị trí code

| Tính năng | File giao diện | Route | Controller/service (hàm) | Bảng DB | File test |
|---|---|---|---|---|---|
| Đăng ký | `public/register.html`, `public/js/api.js` | `POST /api/auth/register` | `auth.controller.register` | `users` | `tests/auth.test.js` |
| Đăng nhập/đăng xuất | `public/login.html`, `public/js/api.js` | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | `auth.controller.login`, `logout`, `me` | `users`; session lưu `userId`, `role` | `tests/auth.test.js`, `tests/loginRateLimit.test.js` |
| Ràng buộc mật khẩu | `public/register.html`, `public/js/api.js` | `POST /api/auth/register` | `auth.controller.register` | `users.password_hash` | `tests/auth.test.js` |
| Phân quyền theo vai trò | `public/js/admin-nav.js`; các trang `public/admin/*.html` | `middleware/auth.js` áp dụng cho `/api/bookings`, `/api/admin/*` | `requireLogin`, `requireRole`; các controller được gắn trong route | `users.role` | `tests/auth.test.js`, `tests/booking.test.js` |
| Chuyển hướng sau đăng nhập | `public/login.html`, `public/js/api.js`; kiểm soát trang admin tại `public/js/admin-nav.js` | Đăng nhập dùng `POST /api/auth/login`; trang admin xác thực qua `GET /api/auth/me` | `auth.controller.login`; client `initializeAuthForms`, `getSafeInternalRedirect`, `initializeAdminNavigation` | `users`; session | Chưa có test tự động giao diện redirect; kiểm tra browser thủ công |
| Quản lý sân | `public/admin/fields.html`, `public/js/admin.js` | `GET/POST /api/admin/sport-types`, `PUT/DELETE /api/admin/sport-types/:id`; `GET/POST /api/admin/fields`, `PUT/DELETE /api/admin/fields/:id`, `PATCH /api/admin/fields/:id/status` | `admin.controller.getSportTypes`, `createSportType`, `updateSportType`, `deleteSportType`, `getFields`, `createField`, `updateField`, `toggleFieldStatus`, `deleteField` | `sport_types`, `fields`, `bookings` (kiểm tra lịch trước khi xóa sân) | Chưa có test riêng cho CRUD admin |
| Bảng giá | `public/admin/fields.html`, `public/js/admin.js` | `GET/POST /api/admin/price-rules`, `PUT/DELETE /api/admin/price-rules/:id` | `admin.controller.getPriceRules`, `createPriceRule`, `updatePriceRule`, `deletePriceRule` | `price_rules`, `sport_types` | Chưa có test CRUD admin; tính giá có `tests/pricing.test.js` |
| Kiểm tra sân trống | `public/index.html`, `public/schedule.html`, `public/js/home.js`, `public/js/schedule.js` | `GET /api/fields`, `GET /api/fields/available`, `GET /api/fields/:id/schedule` | `availability.service.validateTimeRange`, `isRangeFree`, `getFieldSchedule`, `findAvailableFields` | `fields`, `bookings`, `blocked_slots` | `tests/availability.test.js`, `tests/booking.test.js` |
| Tính giá | `public/schedule.html`, `public/js/schedule.js`, `public/booking.html`, `public/js/booking.js` | `GET /api/price` | `pricing.service.calculatePrice`, `calculateDeposit`, `determineDayType` | `price_rules` | `tests/pricing.test.js` |
| Đặt sân (transaction) | `public/booking.html`, `public/js/booking.js` | `POST /api/bookings` | `booking.controller.create` → `booking.service.createBooking` | `fields`, `bookings`, `price_rules`, `users` | `tests/booking.test.js` |
| Giữ chỗ hết hạn | Không có giao diện riêng; thời hạn hiển thị tại `public/js/my-bookings.js` | Không có route riêng; job bắt đầu trong `server.js` | `expiry.job.startExpiryJob`, `expirePendingBookings` | `bookings.expires_at`, `bookings.status` | `tests/booking.test.js` |
| Hủy lịch | `public/my-bookings.html`, `public/js/my-bookings.js` | `GET /api/bookings/mine`, `PATCH /api/bookings/:id/cancel` | `booking.controller.mine`, `cancel` → `booking.service.getMyBookings`, `cancelBooking` | `bookings`, `payments` (yêu cầu hoàn cọc) | `tests/booking.test.js` |
| Thanh toán/cọc | `public/admin/bookings.html`, `public/js/admin-bookings.js`; khách xem hướng dẫn tại `public/js/my-bookings.js` | `POST /api/admin/bookings/:id/payments`, `PATCH /api/admin/bookings/:id/status` | `booking.controller.recordPayment`, `updateStatus` → `booking.service.recordBookingPayment`, `updateBookingStatus` | `payments`, `bookings`, `users` | `tests/booking.test.js` |
| Khóa sân | `public/admin/blocked.html`, `public/js/admin-blocked.js` | `GET/POST /api/admin/blocked-slots`, `DELETE /api/admin/blocked-slots/:id`; lịch tổng `GET /api/admin/blocked-slots/schedule` | `blocked-slots.controller.list/create/remove/schedule` → `blocked-slots.service.getBlockedSlots`, `createBlockedSlot`, `deleteBlockedSlot`, `getDailySchedule` | `blocked_slots`, `bookings`, `fields`, `users` | `tests/blocked-slots.test.js` |
| Thống kê | `public/admin/dashboard.html`, `public/js/admin-stats.js` | `GET /api/admin/stats?month=YYYY-MM` | `stats.controller.getMonthlyStats` → `stats.service.getMonthlyStats`, `calculateStatistics` | `payments`, `bookings`, `fields` | `tests/stats.test.js` |

**Lưu ý đối chiếu:** `routes/fields.routes.js` khai báo các endpoint công khai và thực hiện truy vấn danh sách loại hình/sân trực tiếp; không có `sport-types.controller.js`. Bảng trên ghi route và hàm theo code hiện có, không theo tên dự kiến ban đầu.

### Luồng một request đăng nhập

1. Người dùng nhập form trong `public/login.html`.
2. `public/js/api.js` đăng ký submit handler qua `initializeAuthForms`; handler gọi `apiFetch('/api/auth/login', ...)`.
3. `routes/auth.routes.js` khai báo `POST /login`, áp dụng `loginRateLimit`, rồi gọi `auth.controller.login`.
4. `controllers/auth.controller.js` → `login` truy vấn `users` bằng `pool.execute` với email truyền qua placeholder `?`, rồi kiểm tra hash bằng `bcrypt.compare`.
5. Khi hợp lệ, `login` gọi `regenerateSession`, gán `req.session.userId` và `req.session.role`, rồi `saveSession`. Cấu hình cookie/session nằm trong `server.js`.
6. Controller trả JSON `{ ok: true, data: { user } }`; `apiFetch` phân tích JSON và trả payload cho handler.
7. Handler lấy role từ phản hồi, kiểm tra `redirect` bằng `getSafeInternalRedirect`, rồi điều hướng: admin → `/admin/dashboard.html`, staff → `/admin/bookings.html`, customer → `/`. Redirect nội bộ hợp lệ được ưu tiên; staff không được redirect tới trang admin-only.

### Hướng dẫn sửa tính năng

Các đoạn dưới đây là hướng dẫn thay đổi trong tương lai; **không được áp dụng vào code hiện tại**.

#### 1. Bắt buộc mật khẩu có ký tự `@`

**File/hàm:** `controllers/auth.controller.js` → `PASSWORD_SPECIAL_CHARACTER`, `register`; gợi ý form tại `public/register.html`. Server là nơi quyết định hợp lệ.

Hiện tại:

```js
const PASSWORD_SPECIAL_CHARACTER = /[^\p{L}\p{N}\s]/u;
// register:
if (!PASSWORD_SPECIAL_CHARACTER.test(password)) {
  throw createHttpError(400, 'Mật khẩu phải chứa ít nhất một ký tự đặc biệt.');
}
```

Đề xuất:

```js
const PASSWORD_SPECIAL_CHARACTER = /@/;
// register:
if (!PASSWORD_SPECIAL_CHARACTER.test(password)) {
  throw createHttpError(400, 'Mật khẩu phải chứa ký tự @.');
}
```

Đổi lời nhắc trong `public/register.html` thành “Mật khẩu cần ít nhất 6 ký tự và có ký tự @.” Không bỏ kiểm tra phía server. Cập nhật `tests/auth.test.js`: `abcde!` phải bị từ chối, `abcde@` được đăng ký, đồng thời gửi `role: 'admin'` vẫn phải tạo `customer`. Kiểm tra thủ công đăng ký bằng hai mật khẩu trên.

#### 2. Đổi thời gian giữ chỗ từ 30 phút thành 15 phút

**File/hàm:** `.env.example`; `services/booking.service.js` → `createBooking`; `tests/booking.test.js`.

Hiện tại:

```env
HOLD_MINUTES=30
```

```js
const holdMinutes = getConfigInteger('HOLD_MINUTES', 30, 1);
```

Đề xuất:

```env
HOLD_MINUTES=15
```

```js
const holdMinutes = getConfigInteger('HOLD_MINUTES', 15, 1);
```

Đổi `.env` local tương ứng; cập nhật setup/assert thời gian hết hạn trong test tạo booking và test expiry. Kiểm tra thủ công: tạo lượt pending, xác nhận thời hạn hiển thị 15 phút, chờ/đặt thời gian test vượt hạn và xác nhận khung giờ được giải phóng.

#### 3. Đổi giờ mở cửa/đóng cửa

**File/hàm:** `.env.example`; `routes/fields.routes.js` → `GET /api/config`; `services/availability.service.js` → `readOpeningHours`, `validateTimeRange`; `tests/availability.test.js`, `tests/pricing.test.js`.

Hiện tại:

```env
OPEN_TIME=06:00
CLOSE_TIME=22:00
```

```js
openTime: process.env.OPEN_TIME || '06:00',
closeTime: process.env.CLOSE_TIME || '22:00',
```

Đề xuất (thay hai giá trị dưới bằng giờ đã chốt):

```env
OPEN_TIME=[TÔI ĐIỀN: giờ mở cửa mới]
CLOSE_TIME=[TÔI ĐIỀN: giờ đóng cửa mới]
```

Giờ đóng phải sau giờ mở. Kiểm tra các ranh giới trong `validateTimeRange`, lưới lịch, bảng giá phủ khoảng thời gian mới và cấu hình trả về từ `/api/config`. Sửa thời gian test để không phụ thuộc vào giá trị cũ. Kiểm tra thủ công các khung ngay trước giờ mở, đúng giờ mở, đúng giờ đóng và sau giờ đóng.

#### 4. Giới hạn mỗi khách tối đa 2 lượt `pending` cùng lúc

**File/hàm:** `services/booking.service.js` → `createBooking`; test thêm trong `tests/booking.test.js`.

Hiện `createBooking` khóa sân rồi kiểm tra khoảng trống, nhưng chưa đếm lượt pending của khách. Để tránh hai request đồng thời trên **hai sân khác nhau** cùng vượt hạn mức, khóa hàng khách trong cùng transaction trước khi đếm:

```js
const [customerRows] = await connection.execute(
  'SELECT id FROM users WHERE id = ? FOR UPDATE',
  [customerId],
);
const [pendingRows] = await connection.execute(
  `SELECT COUNT(*) AS activePending
   FROM bookings
   WHERE user_id = ? AND status = 'pending' AND expires_at > NOW()`,
  [customerId],
);
if (Number(pendingRows[0].activePending) >= 2) {
  throw createError(409, 'Bạn chỉ được giữ tối đa 2 lượt đặt đang chờ.');
}
```

Đặt đoạn này bên trong `withTransaction` trước `INSERT`; tiếp tục giữ kiểm tra `fieldId` và `isRangeFree`. Cách đếm trên định nghĩa “đang pending” là lượt pending chưa hết hạn. Nếu muốn tính cả pending đã hết hạn nhưng chưa được job cập nhật, cần chọn rõ chính sách `[TÔI ĐIỀN: tính pending còn hạn hay mọi pending chưa hủy?]`.

Thêm test: khách tạo được lượt thứ nhất và thứ hai, lượt thứ ba bị 409; lượt hết hạn không làm khách bị khóa nếu chọn định nghĩa active pending; hai request song song của cùng khách nhưng khác sân không thể vượt quá hai lượt. Kiểm tra thủ công bằng hai tab/tài khoản khách.

#### 5. Thêm vai trò hoặc trạng thái đặt mới

**File liên quan nếu thêm vai trò:** `sql/schema.sql` (ENUM `users.role`), `sql/seed.sql`, `middleware/auth.js`/các khai báo `requireRole` trong `routes/*.routes.js`, `public/js/admin-nav.js` và test xác thực/phân quyền.

Hiện tại:

```sql
role ENUM('customer','staff','admin') NOT NULL DEFAULT 'customer'
```

Ví dụ đề xuất thêm role `manager` (quyền cụ thể phải được chốt trước; không cho đăng ký công khai tự chọn role):

```sql
role ENUM('customer','staff','admin','manager') NOT NULL DEFAULT 'customer'
```

Sau đó chỉ thêm `manager` vào `requireRole(...)` ở các API thật sự được phép; cấp tài khoản qua seed/quy trình admin, cập nhật điều hướng giao diện nếu cần, và test cho phép/từ chối từng nhóm API. Kiểm tra thủ công bằng session có role mới; không tin role trong body đăng ký.

**File liên quan nếu thêm trạng thái:** `sql/schema.sql` (`bookings.status`), `services/booking.service.js` → `BOOKING_STATUS_TRANSITIONS`, `services/stats.service.js` → `BOOKING_STATUSES`, `public/admin/bookings.html` (bộ lọc), `public/js/admin-bookings.js` → `statusActions`, `public/js/admin-stats.js` → `statusLabels`, cùng test đặt/thống kê.

Hiện tại đoạn chuyển trạng thái:

```js
confirmed: ['completed', 'no_show', 'cancelled'],
completed: [],
no_show: [],
cancelled: [],
```

Ví dụ đề xuất thêm `checked_in` (cần xác định quy tắc nghiệp vụ và quyền trước khi triển khai):

```js
confirmed: ['checked_in', 'completed', 'no_show', 'cancelled'],
checked_in: ['completed'],
completed: [],
no_show: [],
cancelled: [],
```

Đồng bộ ENUM, validation/service, danh sách lọc/nút thao tác ở giao diện và thống kê. Thêm test chuyển hợp lệ, chuyển sai thứ tự, quyền gọi API và bộ đếm trạng thái. Kiểm tra thủ công toàn bộ vòng đời mới trên trang lượt đặt.

---

## 11. Skills và công cụ hỗ trợ

| Skill/công cụ | Tình trạng trong repo | Mục đích / ví dụ có thật |
|---|---|---|
| `.github/instructions.md` | Có | Ghi quy ước stack, cấu trúc và bảo mật. Tên file thực tế không phải `.github/copilot-instructions.md`; không có `.github/prompts/`. |
| `prompt.md` | Có trong worktree, hiện chưa được Git theo dõi | Chứa prompt 0–12; ví dụ Prompt 8 yêu cầu transaction, chống đặt trùng và test `Promise.all`. |
| `PROMPTS.md` | Không tìm thấy | Không ghi là công cụ đã dùng trong dự án. |
| Chế độ Copilot Agent | Đã dùng theo quy trình prompt nhỏ được ghi trong `prompt.md`; không có file cấu hình Agent riêng | Git log có các commit riêng cho auth, availability, giá, đặt, thanh toán, khóa sân và thống kê. |
| Jest | Có trong `devDependencies`; script `npm test` | Chạy unit/service tests như `tests/pricing.test.js`, `tests/availability.test.js`, `tests/stats.test.js`. |
| Supertest | Có trong `devDependencies`, dùng trong test | Gửi request tới app Express trong `tests/auth.test.js`, `tests/loginRateLimit.test.js` và test phân quyền ở `tests/booking.test.js`. |
| Node.js `--watch` | Script `dev` trong `package.json` | `npm run dev` chạy `node --watch server.js`; đây là cách thay `nodemon` hiện tại. |
| Chart.js | Nạp CDN trong `public/admin/dashboard.html` | Vẽ doanh thu theo ngày và lượt đặt theo giờ trong `public/js/admin-stats.js`. |
| Graphify | **Chưa thực hiện**; không có lệnh `graphify`, `uv` hoặc `pipx` trong môi trường kiểm tra; không có đầu ra `docs/graph/` | Tài liệu chính thức mô tả `/graphify .` như lệnh trong cửa sổ chat của assistant, không phải lệnh shell. Chưa tạo graph hay báo cáo. |

Tài liệu chính thức Graphify: [Graphify README](https://github.com/Graphify-Labs/graphify) hướng cài CLI bằng `uv tool install graphifyy` hoặc `pipx install graphifyy`; [Graphify Docs](https://docs.graphify.com) ghi `/graphify .` được nhập trong assistant chat và đầu ra mặc định gồm `graph.html`, `GRAPH_REPORT.md`, `graph.json` trong `graphify-out/`. Hiện chưa có `uv`/`pipx` để cài theo hướng dẫn đó và giao diện hiện tại không cung cấp lệnh slash `/graphify`, vì vậy không chạy thử, không tạo `docs/graph/` và không bịa kết quả. Sau khi cài trong môi trường hỗ trợ, có thể yêu cầu lưu/copy đầu ra thực tế vào `docs/graph/`; graph có thể hỗ trợ dò node, đường phụ thuộc và cụm module, nhưng không thay việc đọc code để xác nhận hành vi.

---

## 12. Kiểm thử kết hợp nhiều công cụ

### Công cụ đang có

| Công cụ | Phục vụ gì | Lệnh chạy | Loại lỗi có thể phát hiện |
|---|---|---|---|
| Jest | Unit/service tests và test tích hợp trong repo | `npm test`; chạy chọn lọc: `npm test -- tests/availability.test.js tests/pricing.test.js` | Quy tắc thời gian, chồng lấn, giá, transaction giả lập, hết hạn, thống kê, chuyển trạng thái sai |
| Supertest | Gửi HTTP request trong test Express; được gọi từ test Jest | Cùng lệnh Jest ở trên; xem `tests/auth.test.js`, `tests/loginRateLimit.test.js`, `tests/booking.test.js` | Status/body API, session, rate limit và từ chối quyền customer với API nhân viên |
| Browser kiểm tra thủ công | Thử luồng giao diện thật, responsive và điều hướng | Khởi động `npm run dev`, mở `http://localhost:3000` | Lỗi DOM/hiển thị, điều hướng theo role, thao tác nhiều trang, bố cục và trải nghiệm bàn phím |

Không thấy Playwright/Cypress, file REST Client `.http`, hoặc script/cấu hình coverage trong repo; do đó **chưa có automated end-to-end UI test**. Jest có thể được gọi với option coverage nếu cần, nhưng hiện không có coverage script/report lưu trong repo. Test DB trong các suite dùng mock/fixture; không thay thế kiểm thử tích hợp với MySQL/XAMPP thật.

Lần chạy kiểm tra khi cập nhật tài liệu này: `npm test -- --runInBand` — **7 test suites passed, 48 tests passed**.

### Cách các lớp kiểm thử bổ trợ nhau

1. **Unit/service:** `availability.test.js`, `pricing.test.js`, `stats.test.js` kiểm tra logic cô lập.
2. **API/integration:** Supertest chạy qua Express route/controller/middleware trong auth, rate limit và kiểm tra 403. Một số luồng nghiệp vụ đặt/thanh toán kiểm tra trực tiếp service với DB giả lập.
3. **Giao diện:** chưa có E2E tự động; kiểm tra thủ công sau khi các API và service đạt test.
4. **Thủ công:** kiểm tra trình duyệt với MySQL local khi cần, nhất là quy trình thanh toán và quyền theo role.

Ca biên đã có test: hai lượt tiếp giáp 18:00 được phép; chồng lấn một phần hoặc nằm trong khoảng bận bị từ chối; giờ bắt đầu bằng giờ kết thúc, giờ đảo ngược, ngoài giờ và ngày quá khứ; giá cắt qua mốc 17:00 và thứ 7 so với thứ 2; hai request cùng slot chạy `Promise.allSettled` chỉ một thành công; đặt trùng khóa sân; pending hết hạn; sai thứ tự trạng thái; customer gọi API nhân viên bị 403.

### Checklist kiểm thử thủ công giao diện

- [ ] Chọn môn/ngày hợp lệ trên trang chủ; ngày quá khứ không được xem lịch.
- [ ] Trên trang lịch, kiểm tra màu ô trống/đã đặt/bị khóa/đã qua; chỉ chọn được các giờ liền nhau trong giới hạn.
- [ ] Chọn khoảng giờ cắt qua giờ cao điểm và đối chiếu tổng/chi tiết giá với API.
- [ ] Mở hai tab để thử đặt cùng sân/giờ; chỉ một yêu cầu được giữ chỗ.
- [ ] Đăng nhập admin, staff, customer; kiểm tra role đích sau login, redirect nội bộ và quyền truy cập từng trang quản trị.
- [ ] Đặt sân, kiểm tra tiền cọc/nội dung chuyển khoản/thời hạn; ghi nhận cọc, xác nhận, thu phần còn lại và hoàn tất.
- [ ] Hủy trong/ngoài mốc chính sách; kiểm tra yêu cầu hoàn cọc và lịch sử khoản thu.
- [ ] Khóa giờ đang có booking; kiểm tra danh sách xung đột; tạo khóa giờ trống rồi xác nhận khách không đặt được.
- [ ] Thử lọc lượt đặt, thay tháng thống kê và kiểm tra trạng thái rỗng/lỗi/loading.
- [ ] Dùng bàn phím (Tab/Enter), kiểm tra focus nhìn thấy được và cuộn ngang lưới/bảng trên màn hình điện thoại.

---