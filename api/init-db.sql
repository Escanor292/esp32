CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  location_name TEXT NOT NULL,
  status TEXT DEFAULT 'offline',
  last_heartbeat TIMESTAMPTZ,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  device_id TEXT DEFAULT 'store_001',
  transaction_code TEXT,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  gateway TEXT,
  bank_reference_id TEXT,
  content TEXT,
  reference_code TEXT,
  description TEXT,
  expires_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  transaction_code TEXT UNIQUE,
  store_name TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  vat NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  payment_gateway TEXT,
  bank_reference_id TEXT,
  webhook_content TEXT,
  webhook_reference_code TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  transaction_code TEXT,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO devices (id, location_name, status, config)
VALUES
  ('store_001', 'Quầy Thu Ngân 1', 'offline', '{"model":"ESP32-DevKit"}'),
  ('store_002', 'Quầy Pha Chế 2', 'offline', '{"model":"ESP32-DevKit"}'),
  ('store_003', 'Quầy Mang Về (Takeaway)', 'offline', '{"model":"ESP32-DevKit"}')
ON CONFLICT (id) DO NOTHING;
