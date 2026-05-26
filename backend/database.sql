-- Payment Notification System Database Schema

-- Create database
CREATE DATABASE IF NOT EXISTS payment_system;
USE payment_system;

-- ============ DEVICES TABLE ============
CREATE TABLE IF NOT EXISTS devices (
  id VARCHAR(50) PRIMARY KEY,
  location_name VARCHAR(255),
  status ENUM('online', 'offline', 'error') DEFAULT 'offline',
  last_heartbeat TIMESTAMP NULL,
  config JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_last_heartbeat (last_heartbeat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ TRANSACTIONS TABLE ============
CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(36) PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL,
  transaction_code VARCHAR(16) UNIQUE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  requested_amount DECIMAL(15, 2),
  status ENUM('pending', 'confirmed', 'expired', 'failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL,
  expires_at TIMESTAMP NULL,
  bank_reference_id VARCHAR(100),
  FOREIGN KEY (device_id) REFERENCES devices(id),
  INDEX idx_device_id (device_id),
  INDEX idx_transaction_code (transaction_code),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ NOTIFICATION QUEUE TABLE ============
CREATE TABLE IF NOT EXISTS notification_queue (
  id VARCHAR(36) PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL,
  transaction_code VARCHAR(16) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id),
  INDEX idx_device_id (device_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ LOGS TABLE ============
CREATE TABLE IF NOT EXISTS logs (
  id VARCHAR(36) PRIMARY KEY,
  device_id VARCHAR(50),
  event_type VARCHAR(50),
  event_details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(id),
  INDEX idx_device_id (device_id),
  INDEX idx_event_type (event_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ API KEYS TABLE ============
CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(36) PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL UNIQUE,
  api_key VARCHAR(255) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used TIMESTAMP NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id),
  INDEX idx_device_id (device_id),
  INDEX idx_api_key (api_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ SAMPLE DATA ============

-- Insert sample device
INSERT INTO devices (id, location_name, status, config) VALUES
('POS-001', 'Shop A - Main Counter', 'offline', '{"model": "ESP32-DFPlayer", "volume": 20, "brightness": 100}');

-- Create indexes for better performance
CREATE INDEX idx_transactions_device_created ON transactions(device_id, created_at);
CREATE INDEX idx_transactions_status_created ON transactions(status, created_at);
CREATE INDEX idx_notification_queue_device_status ON notification_queue(device_id, status);

-- ============ VIEWS ============

-- Daily Revenue View
CREATE OR REPLACE VIEW daily_revenue AS
SELECT 
  DATE(created_at) as date,
  device_id,
  COUNT(*) as transaction_count,
  SUM(amount) as total_revenue,
  AVG(amount) as average_amount
FROM transactions
WHERE status = 'confirmed'
GROUP BY DATE(created_at), device_id;

-- Device Status View
CREATE OR REPLACE VIEW device_status_view AS
SELECT 
  d.id,
  d.location_name,
  d.status,
  d.last_heartbeat,
  COUNT(t.id) as total_transactions,
  SUM(CASE WHEN t.status = 'confirmed' THEN t.amount ELSE 0 END) as total_revenue,
  MAX(t.created_at) as last_transaction
FROM devices d
LEFT JOIN transactions t ON d.id = t.device_id
GROUP BY d.id, d.location_name, d.status, d.last_heartbeat;
