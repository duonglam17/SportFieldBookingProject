# ⚽ Sport Booking – Website Quản lý & Đặt sân thể thao


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

### Luồng một request đăng nhập

1. Người dùng nhập form trong `public/login.html`.
2. `public/js/api.js` đăng ký submit handler qua `initializeAuthForms`; handler gọi `apiFetch('/api/auth/login', ...)`.
3. `routes/auth.routes.js` khai báo `POST /login`, áp dụng `loginRateLimit`, rồi gọi `auth.controller.login`.
4. `controllers/auth.controller.js` → `login` truy vấn `users` bằng `pool.execute` với email truyền qua placeholder `?`, rồi kiểm tra hash bằng `bcrypt.compare`.
5. Khi hợp lệ, `login` gọi `regenerateSession`, gán `req.session.userId` và `req.session.role`, rồi `saveSession`. Cấu hình cookie/session nằm trong `server.js`.
6. Controller trả JSON `{ ok: true, data: { user } }`; `apiFetch` phân tích JSON và trả payload cho handler.
7. Handler lấy role từ phản hồi, kiểm tra `redirect` bằng `getSafeInternalRedirect`, rồi điều hướng: admin → `/admin/dashboard.html`, staff → `/admin/bookings.html`, customer → `/`. Redirect nội bộ hợp lệ được ưu tiên; staff không được redirect tới trang admin-only.


## Skills và công cụ hỗ trợ

| Skill/công cụ | Tình trạng trong repo | Mục đích / ví dụ có thật |
|---|---|---|
| `.github/instructions.md` | Có | Ghi quy ước stack, cấu trúc và bảo mật. |
| Jest | Có trong `devDependencies`; script `npm test` | Chạy unit/service tests như `tests/pricing.test.js`, `tests/availability.test.js`, `tests/stats.test.js`. |
| Supertest | Có trong `devDependencies`, dùng trong test | Gửi request tới app Express trong `tests/auth.test.js`, `tests/loginRateLimit.test.js` và test phân quyền ở `tests/booking.test.js`. |
| Node.js `--watch` | Script `dev` trong `package.json` | `npm run dev` chạy `node --watch server.js`; đây là cách thay `nodemon` hiện tại. |
| Chart.js | Nạp CDN trong `public/admin/dashboard.html` | Vẽ doanh thu theo ngày và lượt đặt theo giờ trong `public/js/admin-stats.js`. |
---

## Kiểm thử kết hợp nhiều công cụ

### Công cụ đang có

| Công cụ | Phục vụ gì | Lệnh chạy | Loại lỗi có thể phát hiện |
|---|---|---|---|
| Jest | Unit/service tests và test tích hợp trong repo | `npm test`; chạy chọn lọc: `npm test -- tests/availability.test.js tests/pricing.test.js` | Quy tắc thời gian, chồng lấn, giá, transaction giả lập, hết hạn, thống kê, chuyển trạng thái sai |
| Supertest | Gửi HTTP request trong test Express; được gọi từ test Jest | Cùng lệnh Jest ở trên; xem `tests/auth.test.js`, `tests/loginRateLimit.test.js`, `tests/booking.test.js` | Status/body API, session, rate limit và từ chối quyền customer với API nhân viên |
| Browser kiểm tra thủ công | Thử luồng giao diện thật, responsive và điều hướng | Khởi động `npm run dev`, mở `http://localhost:3000` | Lỗi DOM/hiển thị, điều hướng theo role, thao tác nhiều trang, bố cục và trải nghiệm bàn phím |


### Cách các lớp kiểm thử bổ trợ nhau

1. **Unit/service:** `availability.test.js`, `pricing.test.js`, `stats.test.js` kiểm tra logic cô lập.
2. **API/integration:** Supertest chạy qua Express route/controller/middleware trong auth, rate limit và kiểm tra 403. Một số luồng nghiệp vụ đặt/thanh toán kiểm tra trực tiếp service với DB giả lập.
3. **Giao diện:** chưa có E2E tự động; kiểm tra thủ công sau khi các API và service đạt test.
4. **Thủ công:** kiểm tra trình duyệt với MySQL local khi cần, nhất là quy trình thanh toán và quyền theo role.