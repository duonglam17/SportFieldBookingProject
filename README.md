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

---

## 7. Danh sách công việc

### Giai đoạn 0 – Chuẩn bị 
- [ ] Cài Node.js (bản LTS) và XAMPP
- [ ] Tạo repo GitHub, thêm `.gitignore` (`node_modules`, `.env`)
- [ ] Mở XAMPP, bật **Apache** và **MySQL**, vào `http://localhost/phpmyadmin`
- [ ] Chốt các môn thể thao, số sân, giờ mở/đóng cửa, bảng giá mẫu (giờ thường, giờ cao điểm 17:00-21:00, cuối tuần)

### Giai đoạn 1 – Khởi tạo dự án 
- [ ] `npm init -y`, cài `express mysql2 bcrypt express-session dotenv`
- [ ] Cài dev: `nodemon jest supertest`
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
- [ ] Trang `admin/blocked.html`: khóa sân theo ngày và khung giờ; không cho khóa trùng lượt đã có khách (phải xử lý lượt đó trước)
- [ ] Xem lịch tổng của tất cả sân trong ngày

### Giai đoạn 8 – Thống kê 
- [ ] API `/api/admin/stats`: doanh thu theo ngày trong tháng, số lượt theo trạng thái, tỉ lệ không đến
- [ ] Khung giờ được đặt nhiều nhất, sân được đặt nhiều nhất
- [ ] Trang `admin/dashboard.html`: các thẻ số liệu và biểu đồ (Chart.js qua CDN)

### Giai đoạn 9 – Giao diện và hoàn thiện
- [ ] CSS dùng chung trong `style.css`, dùng biến CSS cho màu sắc
- [ ] Lưới giờ dùng được trên điện thoại (cuộn ngang trong khung riêng)
- [ ] Thông báo lỗi và thành công rõ ràng, trạng thái đang tải, danh sách rỗng
- [ ] Xử lý lỗi tập trung bằng `errorHandler.js`

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
- [ ] Mọi truy vấn dùng tham số `?`, không nối chuỗi SQL (chống SQL injection)
- [ ] Dữ liệu hiển thị ra HTML phải được escape (chống XSS)
- [ ] Cookie session đặt `httpOnly`; thêm `helmet` và giới hạn số lần đăng nhập
- [ ] Cập nhật README: ảnh chụp màn hình, tài khoản demo, hướng dẫn chạy

---