# Quy ước làm việc cho dự án Sport Booking

Áp dụng các quy ước này cho mọi thay đổi trong dự án. Khi có yêu cầu cụ thể, chỉ thực hiện trong phạm vi yêu cầu đó.

## Công nghệ

- Backend: Node.js và Express.
- Frontend: HTML, CSS và JavaScript thuần; không sử dụng framework frontend.
- Cơ sở dữ liệu: MySQL/MariaDB chạy bằng XAMPP.
- Kết nối cơ sở dữ liệu bằng `mysql2/promise`.
- Các thư viện dự án sử dụng: `bcrypt`, `express-session`, `dotenv`, `jest` và `supertest`.

## Cấu trúc thư mục

Tuân theo cấu trúc mục 5 trong README:

```text
sport-booking/
├── server.js
├── package.json
├── .env
├── .env.example
├── .gitignore
├── config/
│   └── db.js
├── middleware/
│   ├── auth.js
│   └── errorHandler.js
├── routes/
│   ├── auth.routes.js
│   ├── fields.routes.js
│   ├── bookings.routes.js
│   └── admin.routes.js
├── controllers/
├── services/
│   ├── availability.service.js
│   ├── pricing.service.js
│   └── booking.service.js
├── sql/
│   ├── schema.sql
│   └── seed.sql
├── public/
│   ├── index.html
│   ├── schedule.html
│   ├── booking.html
│   ├── my-bookings.html
│   ├── login.html
│   ├── register.html
│   ├── admin/
│   │   ├── dashboard.html
│   │   ├── fields.html
│   │   ├── bookings.html
│   │   └── blocked.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── api.js
│       ├── schedule.js
│       └── admin.js
└── tests/
    ├── availability.test.js
    ├── pricing.test.js
    └── booking.test.js
```

Giữ đúng vai trò của từng lớp: `routes` khai báo endpoint và middleware, `controllers` xử lý yêu cầu/đáp ứng HTTP, `services` chứa nghiệp vụ và thao tác dữ liệu liên quan.

## Quy tắc bắt buộc

- Mọi truy vấn SQL phải dùng tham số `?` và truyền giá trị riêng qua API của `mysql2/promise`. Không nối chuỗi hoặc nội suy dữ liệu đầu vào vào câu SQL.
- Mọi giá tiền và tổng tiền phải được tính ở server. Server cũng phải tự kiểm tra quyền và vai trò; không tin giá trị, tổng tiền, quyền hoặc vai trò do client gửi lên.
- Escape dữ liệu không đáng tin cậy trước khi hiển thị trong HTML để ngăn chèn nội dung thực thi.
- Truyền ngày dưới dạng chuỗi `YYYY-MM-DD`, giờ dưới dạng chuỗi `HH:MM`. Không dùng đối tượng `Date` để lưu ngày/giờ vào cơ sở dữ liệu.
- Hai khoảng giờ cùng ngày chồng lấn khi `start_cũ < end_mới` và `end_cũ > start_mới`. Hai khoảng chỉ tiếp giáp nhau ở đầu/cuối thì không chồng lấn.
- Dùng `async/await` cho xử lý bất đồng bộ.
- Tổ chức xử lý theo luồng `routes` → `controllers` → `services`.
- API trả thành công theo dạng `{ ok, data }`; trả lỗi theo dạng `{ ok: false, error }`.
- Nội dung thông báo lỗi dành cho người dùng phải bằng tiếng Việt.

## Cách làm việc và bàn giao

- Thực hiện đúng phạm vi của yêu cầu; không tự thêm tính năng hoặc thay đổi không được yêu cầu.
- Khi hoàn tất, liệt kê các file đã tạo hoặc sửa và nêu cách chạy thử phù hợp với thay đổi.
