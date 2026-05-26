-- Personal Income Management Database Schema

-- ============ PERSONAL TRANSACTIONS TABLE ============
CREATE TABLE IF NOT EXISTS personal_transactions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  transaction_code VARCHAR(16) UNIQUE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  transaction_type ENUM('income', 'expense', 'transfer') DEFAULT 'income',
  category VARCHAR(50),
  description VARCHAR(255),
  payment_method ENUM('bank_transfer', 'cash', 'card', 'qr_code') DEFAULT 'bank_transfer',
  bank_reference_id VARCHAR(100),
  status ENUM('pending', 'confirmed', 'failed', 'refunded') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL,
  notes TEXT,
  
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at),
  INDEX idx_status (status),
  INDEX idx_category (category),
  INDEX idx_transaction_type (transaction_type),
  INDEX idx_user_date (user_id, created_at),
  INDEX idx_transaction_code (transaction_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ INCOME CATEGORIES TABLE ============
CREATE TABLE IF NOT EXISTS income_categories (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  description TEXT,
  color_code VARCHAR(7),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_category (user_id, category_name),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ DAILY INCOME SUMMARY TABLE ============
CREATE TABLE IF NOT EXISTS daily_income_summary (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  summary_date DATE NOT NULL,
  total_income DECIMAL(15, 2) DEFAULT 0,
  total_expense DECIMAL(15, 2) DEFAULT 0,
  net_income DECIMAL(15, 2) DEFAULT 0,
  transaction_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_daily (user_id, summary_date),
  INDEX idx_user_id (user_id),
  INDEX idx_summary_date (summary_date),
  INDEX idx_user_date (user_id, summary_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ MONTHLY INCOME REPORT TABLE ============
CREATE TABLE IF NOT EXISTS monthly_income_report (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  report_month DATE NOT NULL,
  total_income DECIMAL(15, 2) DEFAULT 0,
  total_expense DECIMAL(15, 2) DEFAULT 0,
  net_income DECIMAL(15, 2) DEFAULT 0,
  transaction_count INT DEFAULT 0,
  category_breakdown JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_monthly (user_id, report_month),
  INDEX idx_user_id (user_id),
  INDEX idx_report_month (report_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ AUDIT LOGS TABLE ============
CREATE TABLE IF NOT EXISTS personal_audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  action VARCHAR(100),
  resource_type VARCHAR(50),
  resource_id VARCHAR(36),
  old_value JSON,
  new_value JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at),
  INDEX idx_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ VIEWS ============

-- View: Daily Income Summary
CREATE OR REPLACE VIEW daily_income_view AS
SELECT 
  DATE(created_at) as date,
  user_id,
  COUNT(*) as transaction_count,
  SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as total_income,
  SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as total_expense,
  SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) - 
  SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as net_income
FROM personal_transactions
WHERE status = 'confirmed'
GROUP BY DATE(created_at), user_id;

-- View: Monthly Income Summary
CREATE OR REPLACE VIEW monthly_income_view AS
SELECT 
  DATE_FORMAT(created_at, '%Y-%m-01') as month,
  user_id,
  COUNT(*) as transaction_count,
  SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as total_income,
  SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as total_expense,
  SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) - 
  SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as net_income
FROM personal_transactions
WHERE status = 'confirmed'
GROUP BY DATE_FORMAT(created_at, '%Y-%m'), user_id;

-- View: Category Breakdown
CREATE OR REPLACE VIEW category_breakdown_view AS
SELECT 
  user_id,
  category,
  transaction_type,
  COUNT(*) as count,
  SUM(amount) as total,
  AVG(amount) as average
FROM personal_transactions
WHERE status = 'confirmed'
GROUP BY user_id, category, transaction_type;

-- ============ SAMPLE DATA ============

-- Insert sample categories
INSERT INTO income_categories (id, user_id, category_name, description, color_code) VALUES
('cat_001', 'user_001', 'Bán hàng', 'Thu nhập từ bán sản phẩm', '#FF5733'),
('cat_002', 'user_001', 'Dịch vụ', 'Thu nhập từ dịch vụ', '#33FF57'),
('cat_003', 'user_001', 'Vận chuyển', 'Chi phí vận chuyển', '#3357FF'),
('cat_004', 'user_001', 'Khác', 'Thu nhập khác', '#FF33F5');

-- ============ STORED PROCEDURES ============

-- Procedure: Update Daily Summary
DELIMITER //
CREATE PROCEDURE update_daily_summary(IN p_user_id VARCHAR(50), IN p_date DATE)
BEGIN
  DECLARE v_total_income DECIMAL(15, 2);
  DECLARE v_total_expense DECIMAL(15, 2);
  DECLARE v_transaction_count INT;

  SELECT 
    SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END),
    SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END),
    COUNT(*)
  INTO v_total_income, v_total_expense, v_transaction_count
  FROM personal_transactions
  WHERE user_id = p_user_id AND DATE(created_at) = p_date AND status = 'confirmed';

  INSERT INTO daily_income_summary 
  (id, user_id, summary_date, total_income, total_expense, net_income, transaction_count)
  VALUES (
    UUID(),
    p_user_id,
    p_date,
    COALESCE(v_total_income, 0),
    COALESCE(v_total_expense, 0),
    COALESCE(v_total_income, 0) - COALESCE(v_total_expense, 0),
    COALESCE(v_transaction_count, 0)
  )
  ON DUPLICATE KEY UPDATE
    total_income = COALESCE(v_total_income, 0),
    total_expense = COALESCE(v_total_expense, 0),
    net_income = COALESCE(v_total_income, 0) - COALESCE(v_total_expense, 0),
    transaction_count = COALESCE(v_transaction_count, 0),
    updated_at = NOW();
END //
DELIMITER ;

-- Procedure: Update Monthly Summary
DELIMITER //
CREATE PROCEDURE update_monthly_summary(IN p_user_id VARCHAR(50), IN p_month DATE)
BEGIN
  DECLARE v_total_income DECIMAL(15, 2);
  DECLARE v_total_expense DECIMAL(15, 2);
  DECLARE v_transaction_count INT;
  DECLARE v_category_breakdown JSON;

  SELECT 
    SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END),
    SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END),
    COUNT(*)
  INTO v_total_income, v_total_expense, v_transaction_count
  FROM personal_transactions
  WHERE user_id = p_user_id 
    AND DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(p_month, '%Y-%m')
    AND status = 'confirmed';

  SELECT JSON_OBJECT(
    'income', SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END),
    'expense', SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END)
  )
  INTO v_category_breakdown
  FROM personal_transactions
  WHERE user_id = p_user_id 
    AND DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(p_month, '%Y-%m')
    AND status = 'confirmed';

  INSERT INTO monthly_income_report 
  (id, user_id, report_month, total_income, total_expense, net_income, transaction_count, category_breakdown)
  VALUES (
    UUID(),
    p_user_id,
    DATE_FORMAT(p_month, '%Y-%m-01'),
    COALESCE(v_total_income, 0),
    COALESCE(v_total_expense, 0),
    COALESCE(v_total_income, 0) - COALESCE(v_total_expense, 0),
    COALESCE(v_transaction_count, 0),
    v_category_breakdown
  )
  ON DUPLICATE KEY UPDATE
    total_income = COALESCE(v_total_income, 0),
    total_expense = COALESCE(v_total_expense, 0),
    net_income = COALESCE(v_total_income, 0) - COALESCE(v_total_expense, 0),
    transaction_count = COALESCE(v_transaction_count, 0),
    category_breakdown = v_category_breakdown,
    updated_at = NOW();
END //
DELIMITER ;

-- ============ TRIGGERS ============

-- Trigger: Auto update daily summary when transaction is added
DELIMITER //
CREATE TRIGGER tr_update_daily_summary_after_insert
AFTER INSERT ON personal_transactions
FOR EACH ROW
BEGIN
  CALL update_daily_summary(NEW.user_id, DATE(NEW.created_at));
END //
DELIMITER ;

-- Trigger: Auto update daily summary when transaction is updated
DELIMITER //
CREATE TRIGGER tr_update_daily_summary_after_update
AFTER UPDATE ON personal_transactions
FOR EACH ROW
BEGIN
  CALL update_daily_summary(NEW.user_id, DATE(NEW.created_at));
END //
DELIMITER ;

-- Trigger: Log changes to audit table
DELIMITER //
CREATE TRIGGER tr_audit_transaction_insert
AFTER INSERT ON personal_transactions
FOR EACH ROW
BEGIN
  INSERT INTO personal_audit_logs 
  (id, user_id, action, resource_type, resource_id, new_value)
  VALUES (
    UUID(),
    NEW.user_id,
    'INSERT',
    'transaction',
    NEW.id,
    JSON_OBJECT(
      'amount', NEW.amount,
      'category', NEW.category,
      'description', NEW.description
    )
  );
END //
DELIMITER ;

-- ============ INDEXES FOR PERFORMANCE ============

CREATE INDEX idx_personal_transactions_user_date ON personal_transactions(user_id, created_at);
CREATE INDEX idx_personal_transactions_status_date ON personal_transactions(status, created_at);
CREATE INDEX idx_daily_income_summary_user_date ON daily_income_summary(user_id, summary_date);
CREATE INDEX idx_monthly_income_report_user_month ON monthly_income_report(user_id, report_month);
