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
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  sport_type_id INT NOT NULL,
  description TEXT,
  image_url VARCHAR(255),
  status ENUM('active','maintenance') NOT NULL DEFAULT 'active',
  FOREIGN KEY (sport_type_id) REFERENCES sport_types(id)
);

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