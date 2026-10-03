-- Dữ liệu mẫu phục vụ học tập; không dùng các tài khoản/mật khẩu này ở môi trường thật.
-- Mật khẩu mẫu của tất cả tài khoản là 123456; hash được tạo bằng sql/generate-hash.js.
USE sport_booking;

INSERT INTO users (id, full_name, email, phone, password_hash, role) VALUES
  (1, 'Quản trị viên mẫu', 'admin@example.com', '0900000001', '$2b$10$XL90oTr3vJUAfR4yYlIAf.DLvYfNRmpDuiUrI87au1O8FXdlzDzLC', 'admin'),
  (2, 'Nhân viên mẫu', 'staff@example.com', '0900000002', '$2b$10$XL90oTr3vJUAfR4yYlIAf.DLvYfNRmpDuiUrI87au1O8FXdlzDzLC', 'staff'),
  (3, 'Khách hàng mẫu 1', 'customer1@example.com', '0900000003', '$2b$10$XL90oTr3vJUAfR4yYlIAf.DLvYfNRmpDuiUrI87au1O8FXdlzDzLC', 'customer'),
  (4, 'Khách hàng mẫu 2', 'customer2@example.com', '0900000004', '$2b$10$XL90oTr3vJUAfR4yYlIAf.DLvYfNRmpDuiUrI87au1O8FXdlzDzLC', 'customer'),
  (5, 'Khách hàng mẫu 3', 'customer3@example.com', '0900000005', '$2b$10$XL90oTr3vJUAfR4yYlIAf.DLvYfNRmpDuiUrI87au1O8FXdlzDzLC', 'customer')
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  phone = VALUES(phone),
  password_hash = VALUES(password_hash),
  role = VALUES(role);

INSERT INTO sport_types (id, name, description) VALUES
  (1, 'Bóng đá mini', 'Sân bóng đá mini'),
  (2, 'Cầu lông', 'Sân cầu lông trong nhà'),
  (3, 'Pickleball', 'Sân pickleball')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);

INSERT INTO fields (id, name, sport_type_id, description, status) VALUES
  (1, 'Sân bóng A1', 1, 'Sân bóng đá số 1', 'active'),
  (2, 'Sân bóng A2', 1, 'Sân bóng đá số 2', 'active'),
  (3, 'Sân bóng A3', 1, 'Sân bóng đá số 3', 'active'),
  (4, 'Sân bóng A4', 1, 'Sân bóng đá số 4', 'active'),
  (5, 'Sân cầu lông B1', 2, 'Sân cầu lông số 1', 'active'),
  (6, 'Sân cầu lông B2', 2, 'Sân cầu lông số 2', 'active'),
  (7, 'Sân cầu lông B3', 2, 'Sân cầu lông số 3', 'active'),
  (8, 'Sân pickleball C1', 3, 'Sân pickleball số 1', 'active'),
  (9, 'Sân pickleball C2', 3, 'Sân pickleball số 2', 'active')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  sport_type_id = VALUES(sport_type_id),
  description = VALUES(description),
  status = VALUES(status);

-- Mỗi loại hình có ba khoảng liền nhau, phủ từ 06:00 đến 22:00.
-- Cuối tuần có giá cao hơn ngày thường ở từng khoảng giờ.
INSERT INTO price_rules (sport_type_id, day_type, start_time, end_time, price_per_hour) VALUES
  (1, 'weekday', '06:00:00', '17:00:00', 300000),
  (1, 'weekday', '17:00:00', '21:00:00', 450000),
  (1, 'weekday', '21:00:00', '22:00:00', 300000),
  (1, 'weekend', '06:00:00', '17:00:00', 360000),
  (1, 'weekend', '17:00:00', '21:00:00', 540000),
  (1, 'weekend', '21:00:00', '22:00:00', 360000),
  (2, 'weekday', '06:00:00', '17:00:00', 80000),
  (2, 'weekday', '17:00:00', '21:00:00', 120000),
  (2, 'weekday', '21:00:00', '22:00:00', 80000),
  (2, 'weekend', '06:00:00', '17:00:00', 100000),
  (2, 'weekend', '17:00:00', '21:00:00', 150000),
  (2, 'weekend', '21:00:00', '22:00:00', 100000),
  (3, 'weekday', '06:00:00', '17:00:00', 160000),
  (3, 'weekday', '17:00:00', '21:00:00', 220000),
  (3, 'weekday', '21:00:00', '22:00:00', 160000),
  (3, 'weekend', '06:00:00', '17:00:00', 200000),
  (3, 'weekend', '17:00:00', '21:00:00', 280000),
  (3, 'weekend', '21:00:00', '22:00:00', 200000);