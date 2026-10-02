# ⚽ Sport Booking – Website Quản lý & Đặt sân thể thao

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
| Phiên đăng nhập | `express-session` |
| Biến môi trường | `dotenv` |
| Kiểm thử | `jest` + `supertest` |
| Công cụ dev | `nodemon` |

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
| PATCH | `/api/admin/bookings/:id/payment` | staff, admin | Cập nhật trạng thái thanh toán |
| POST/DELETE | `/api/admin/blocked-slots` | staff, admin | Khóa / mở khóa sân |
| POST/PUT/DELETE | `/api/admin/sport-types`, `/fields`, `/price-rules` | admin | Quản lý sân và bảng giá |
| GET | `/api/admin/stats?month=YYYY-MM` | admin | Doanh thu, số lượt đặt, giờ cao điểm |
