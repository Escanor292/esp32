/*
 * Payment Notification System - Backend API
 * Express.js Server with WebSocket Support (PostgreSQL Version)
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const mqtt = require('mqtt');
require('dotenv').config();

// ============ CONFIGURATION ============
const PORT = process.env.PORT || 8081;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'payment_system';
const DB_PORT = process.env.DB_PORT || 5432;
const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  'postgresql://neondb_owner:npg_UHY8oPKOlAR2@ep-curly-block-ao7c2dko-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// ============ SEPAY & MQTT CONFIG ============
const SEPAY_API_KEY = process.env.SEPAY_API_KEY || 'your_sepay_api_key';

// IMPORTANT:
// Node.js mqtt library dùng dạng URL: mqtt://broker.emqx.io:1883
// ESP32 PubSubClient chỉ dùng host: broker.emqx.io và port 1883
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker.emqx.io:1883';
const STORE_ID = process.env.STORE_ID || 'store_001';

// Log startup configuration
console.log('🚀 Starting Payment Notification System...');
console.log('📡 MQTT Configuration:');
console.log('   Broker URL:', MQTT_BROKER_URL);
console.log('   Store ID:', STORE_ID);
console.log('   Environment:', process.env.VERCEL ? 'Vercel Serverless' : 'Local Development');

// ============ MQTT HELPER FUNCTION (for Vercel Serverless) ============
function publishMqttOnce(topic, payload) {
  return new Promise((resolve, reject) => {
    const clientId = `vercel-publisher-${STORE_ID}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;

    console.log('📡 MQTT publish start');
    console.log('   Broker:', MQTT_BROKER_URL);
    console.log('   Client ID:', clientId);
    console.log('   Topic:', topic);
    console.log('   Payload:', JSON.stringify(payload));

    const client = mqtt.connect(MQTT_BROKER_URL, {
      clientId,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 0,
      protocolVersion: 4
    });

    let finished = false;

    function finish(err, result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      if (err) {
        try {
          client.end(true);
        } catch (_) {}

        console.error('❌ MQTT publish failed:', err.message || err);
        return reject(err);
      }

      console.log('✅ MQTT publish confirmed by broker');

      client.end(false, {}, () => {
        console.log('✅ MQTT disconnected cleanly');
        return resolve(result);
      });
    }

    const timer = setTimeout(() => {
      finish(new Error('MQTT publish timeout'));
    }, 15000);

    client.on('connect', () => {
      console.log('✅ MQTT connected to broker');

      client.publish(
        topic,
        JSON.stringify(payload),
        {
          qos: 1,
          retain: false
        },
        (err) => {
          if (err) {
            return finish(err);
          }

          return finish(null, {
            topic,
            payload,
            broker: MQTT_BROKER_URL,
            clientId,
            qos: 1
          });
        }
      );
    });

    client.on('error', (err) => {
      console.error('❌ MQTT client error:', err.message || err);
      finish(err);
    });

    client.on('close', () => {
      console.log('ℹ️ MQTT connection closed');
    });
  });
}

// ============ MQTT CLIENT (Legacy - for heartbeat listening) ============
// Trên Vercel, kết nối global có thể không ổn định.
// Nhưng vẫn giữ để dashboard có thể nhận heartbeat MQTT nếu function còn sống.
// Gửi order vẫn dùng publishMqttOnce ở trên.
const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
  clientId: `backend-server-${STORE_ID}-${Math.random().toString(16).slice(2)}`,
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000,
});

mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT Broker:', MQTT_BROKER_URL);
  console.log('   Client ID:', `backend-server-${STORE_ID}`);

  mqttClient.subscribe(`payment/+/heartbeat`, (err) => {
    if (!err) {
      console.log('📡 Subscribed to MQTT heartbeats: payment/+/heartbeat');
    } else {
      console.error('❌ Failed to subscribe to heartbeats:', err);
    }
  });
});

mqttClient.on('disconnect', () => {
  console.warn('⚠️ MQTT Broker disconnected');
});

mqttClient.on('offline', () => {
  console.warn('⚠️ MQTT Client went offline');
});

mqttClient.on('reconnect', () => {
  console.log('🔄 Reconnecting to MQTT Broker...');
});

mqttClient.on('error', (error) => {
  console.error('❌ MQTT Error:', error.message || error);
});

// ============ EXPRESS SETUP ============
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// ============ DATABASE SETUP (PostgreSQL) ============
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Database and Redis Fallback Logic
const fs = require('fs');
const path = require('path');
const DB_FALLBACK_FILE = path.join(__dirname, 'db_fallback.json');

function createDefaultDevices() {
  const now = new Date().toISOString();

  return [
    {
      id: 'store_001',
      location_name: 'Quầy Thu Ngân 1',
      status: 'offline',
      last_heartbeat: null,
      config: { model: 'ESP32-DevKit' },
      created_at: now
    },
    {
      id: 'store_002',
      location_name: 'Quầy Pha Chế 2',
      status: 'offline',
      last_heartbeat: null,
      config: { model: 'ESP32-DevKit' },
      created_at: now
    },
    {
      id: 'store_003',
      location_name: 'Quầy Mang Về (Takeaway)',
      status: 'offline',
      last_heartbeat: null,
      config: { model: 'ESP32-DevKit' },
      created_at: now
    }
  ];
}

async function ensureDefaultDevicesInDb() {
  if (!databaseConnected || useFallback) return;
  const defaults = createDefaultDevices();

  for (const device of defaults) {
    await pool.query(
      `INSERT INTO devices (id, location_name, status, config)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [device.id, device.location_name, device.status || 'offline', JSON.stringify(device.config || {})]
    );
  }
}

function mapOrderRow(row) {
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    id: row.id,
    transaction_code: row.transaction_code,
    store_name: row.store_name,
    items,
    subtotal: Number(row.subtotal || 0),
    vat: Number(row.vat || 0),
    total: Number(row.total || 0),
    status: row.status,
    payment_gateway: row.payment_gateway || null,
    bank_reference_id: row.bank_reference_id || null,
    confirmed_at: row.confirmed_at,
    created_at: row.created_at
  };
}

async function initDatabaseTables() {
  await pool.query(`
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
  `);
}

let useFallback = false;
let databaseConnected = false;
let dbFallback = {
  devices: createDefaultDevices(),
  transactions: [],
  notification_queue: [],
  orders: []
};

async function checkDatabaseConnection() {
  if (!DATABASE_URL) {
    databaseConnected = false;
    useFallback = true;
    return false;
  }

  try {
    await pool.query('SELECT 1 as ok');
    databaseConnected = true;
    useFallback = false;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error.message);
    databaseConnected = false;
    useFallback = true;
    return false;
  }
}

async function canUseDatabase() {
  if (databaseConnected && !useFallback) {
    return true;
  }

  if (!DATABASE_URL) {
    databaseConnected = false;
    useFallback = true;
    return false;
  }

  return checkDatabaseConnection();
}

function saveFallback() {
  // On Vercel serverless, filesystem is read-only / ephemeral.
  // Giữ dữ liệu trong memory cho request hiện tại.
  if (process.env.VERCEL) {
    console.log('⚠️ Running on Vercel - skipping file write (use in-memory only)');
    return;
  }

  try {
    fs.writeFileSync(DB_FALLBACK_FILE, JSON.stringify(dbFallback, null, 2), 'utf8');
  } catch (err) {
    console.error('⚠️ Could not save fallback database:', err);
  }
}

function ensureDefaultDevices() {
  if (!dbFallback.devices) {
    dbFallback.devices = [];
  }

  const defaultDevices = createDefaultDevices();

  for (const defaultDevice of defaultDevices) {
    const existing = dbFallback.devices.find(d => d.id === defaultDevice.id);

    if (!existing) {
      dbFallback.devices.push(defaultDevice);
    } else {
      // Giữ status và last_heartbeat hiện tại, chỉ bổ sung field thiếu
      existing.location_name = existing.location_name || defaultDevice.location_name;
      existing.status = existing.status || 'offline';
      existing.config = existing.config || defaultDevice.config;
      existing.created_at = existing.created_at || defaultDevice.created_at;
    }
  }

  saveFallback();
}

function setFallbackDeviceStatus(deviceId, status = 'online') {
  ensureDefaultDevices();

  let device = dbFallback.devices.find(d => d.id === deviceId);

  if (!device) {
    device = {
      id: deviceId,
      location_name: deviceId === 'store_001' ? 'Quầy Thu Ngân 1' : deviceId,
      status,
      last_heartbeat: new Date().toISOString(),
      config: { model: 'ESP32-DevKit' },
      created_at: new Date().toISOString()
    };

    dbFallback.devices.push(device);
  } else {
    device.status = status;
    device.last_heartbeat = new Date().toISOString();
  }

  saveFallback();
  return device;
}

function getFallbackDevicesWithOfflineCheck() {
  ensureDefaultDevices();

  const threshold = new Date(Date.now() - 60000);

  return dbFallback.devices.map(device => {
    let status = device.status || 'offline';

    if (
      status === 'online' &&
      device.last_heartbeat &&
      new Date(device.last_heartbeat) < threshold
    ) {
      status = 'offline';
      device.status = 'offline';
    }

    return {
      id: device.id,
      location_name: device.location_name,
      status,
      last_heartbeat: device.last_heartbeat || null
    };
  });
}

if (fs.existsSync(DB_FALLBACK_FILE)) {
  try {
    dbFallback = JSON.parse(fs.readFileSync(DB_FALLBACK_FILE, 'utf8'));

    if (!dbFallback.devices) dbFallback.devices = [];
    if (!dbFallback.transactions) dbFallback.transactions = [];
    if (!dbFallback.notification_queue) dbFallback.notification_queue = [];
    if (!dbFallback.orders) dbFallback.orders = [];

    console.log('✅ Loaded database fallback file successfully');
  } catch (err) {
    console.error('⚠️ Could not load database fallback file, starting fresh', err);
  }
}

ensureDefaultDevices();

const fallbackQuery = async (text, params) => {
  ensureDefaultDevices();

  const sql = text.trim().replace(/\s+/g, ' ');
  const p = params || [];

  if (sql.includes('SELECT id FROM devices WHERE id =')) {
    const id = p[0];
    const rows = dbFallback.devices.filter(d => d.id === id).map(d => ({ id: d.id }));
    return { rows };
  }

  if (sql.includes('SELECT * FROM devices WHERE id =')) {
    const id = p[0];
    const rows = dbFallback.devices.filter(d => d.id === id);
    return { rows };
  }

  if (sql.includes('SELECT id, location_name, status, last_heartbeat FROM devices')) {
    const rows = getFallbackDevicesWithOfflineCheck();
    return { rows };
  }

  if (sql.includes('INSERT INTO devices')) {
    const [id, location_name, status, configStr] = p;
    const config = configStr ? JSON.parse(configStr) : {};

    const existing = dbFallback.devices.find(d => d.id === id);
    if (existing) {
      return { rows: [existing] };
    }

    const newDevice = {
      id,
      location_name,
      status: status || 'offline',
      last_heartbeat: null,
      config,
      created_at: new Date().toISOString()
    };

    dbFallback.devices.push(newDevice);
    saveFallback();

    return { rows: [newDevice] };
  }

  if (sql.includes('UPDATE devices SET status =')) {
    const [status, last_heartbeat, id] = p;
    let device = dbFallback.devices.find(d => d.id === id);

    if (!device) {
      device = {
        id,
        location_name: id === 'store_001' ? 'Quầy Thu Ngân 1' : id,
        status: status || 'online',
        last_heartbeat: last_heartbeat ? new Date(last_heartbeat).toISOString() : new Date().toISOString(),
        config: { model: 'ESP32-DevKit' },
        created_at: new Date().toISOString()
      };

      dbFallback.devices.push(device);
    } else {
      device.status = status;
      device.last_heartbeat = last_heartbeat ? new Date(last_heartbeat).toISOString() : new Date().toISOString();
    }

    saveFallback();
    return { rows: [] };
  }

  if (sql.includes('INSERT INTO transactions')) {
    if (p.length === 4) {
      const [id, transaction_code, amount, status] = p;

      const newTx = {
        id,
        device_id: 'store_001',
        transaction_code,
        amount: parseFloat(amount),
        status,
        expires_at: null,
        confirmed_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      dbFallback.transactions.push(newTx);
      saveFallback();

      return { rows: [newTx] };
    }

    const [id, device_id, transaction_code, amount, status, expires_at] = p;

    const newTx = {
      id,
      device_id,
      transaction_code,
      amount: parseFloat(amount),
      status,
      expires_at,
      confirmed_at: null,
      created_at: new Date().toISOString()
    };

    dbFallback.transactions.push(newTx);
    saveFallback();

    return { rows: [newTx] };
  }

  if (sql.includes('SELECT * FROM transactions WHERE transaction_code =') && sql.includes('status =')) {
    const [code, status] = p;
    const rows = dbFallback.transactions.filter(t => t.transaction_code === code && t.status === status);
    return { rows };
  }

  if (sql.includes('SELECT * FROM transactions WHERE transaction_code =')) {
    const [code] = p;
    const rows = dbFallback.transactions.filter(t => t.transaction_code === code);
    return { rows };
  }

  if (sql.includes('UPDATE transactions SET status =') && sql.includes('WHERE transaction_code =')) {
    const [status, confirmed_at, bank_reference_id, transaction_code] = p;
    const tx = dbFallback.transactions.find(t => t.transaction_code === transaction_code);

    if (tx) {
      tx.status = status;
      tx.confirmed_at = confirmed_at;
      tx.bank_reference_id = bank_reference_id;
      saveFallback();
    }

    return { rows: [] };
  }

  if (sql.includes('SELECT * FROM transactions WHERE device_id =')) {
    const [device_id, date_from, date_to] = p;
    const fromTime = new Date(date_from).getTime();
    const toTime = new Date(date_to).getTime();

    const rows = dbFallback.transactions
      .filter(t => {
        const created = new Date(t.created_at).getTime();
        return t.device_id === device_id && created >= fromTime && created <= toTime;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return { rows };
  }

  if (sql.includes('SELECT SUM(amount) as total FROM transactions')) {
    const [status, dateStr] = p;
    const targetDate = new Date(dateStr).toDateString();

    const filtered = dbFallback.transactions.filter(t => {
      return t.status === status && new Date(t.created_at).toDateString() === targetDate;
    });

    const total = filtered.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    return { rows: [{ total }] };
  }

  if (sql.includes('SELECT COUNT(*) as count FROM transactions')) {
    const [status, dateStr] = p;
    const targetDate = new Date(dateStr).toDateString();

    const filtered = dbFallback.transactions.filter(t => {
      return t.status === status && new Date(t.created_at).toDateString() === targetDate;
    });

    return { rows: [{ count: filtered.length }] };
  }

  if (sql.includes('INSERT INTO notification_queue')) {
    const [id, device_id, transaction_code, amount, status] = p;

    const newNotif = {
      id,
      device_id,
      transaction_code,
      amount: parseFloat(amount),
      status,
      created_at: new Date().toISOString(),
      sent_at: null
    };

    dbFallback.notification_queue.push(newNotif);
    saveFallback();

    return { rows: [newNotif] };
  }

  if (sql.includes('UPDATE notification_queue SET status =') && sql.includes('WHERE id =')) {
    const [status, sent_at, id] = p;
    const notif = dbFallback.notification_queue.find(n => n.id === id);

    if (notif) {
      notif.status = status;
      notif.sent_at = sent_at;
      saveFallback();
    }

    return { rows: [] };
  }

  console.log('⚠️ Warning: Fallback query did not match specific pattern:', sql);
  return { rows: [] };
};

const originalQuery = pool.query.bind(pool);

pool.query = async function(text, params) {
  if (useFallback) {
    return fallbackQuery(text, params);
  }

  try {
    return await originalQuery(text, params);
  } catch (err) {
    console.error('❌ PostgreSQL query failed, switching to local database fallback:', err.message);
    databaseConnected = false;
    useFallback = true;
    return fallbackQuery(text, params);
  }
};

pool.connect((err, client, release) => {
  if (err) {
    console.warn('⚠️ Could not connect to PostgreSQL database. Using local JSON fallback database');
    databaseConnected = false;
    useFallback = true;
    ensureDefaultDevices();
  } else {
    console.log('✅ Connected to PostgreSQL database successfully');
    databaseConnected = true;
    useFallback = false;
    release();
    initDatabaseTables()
      .then(() => {
        console.log('✅ PostgreSQL tables initialized');
      })
      .catch((initErr) => {
        console.error('⚠️ PostgreSQL init tables failed:', initErr.message);
        databaseConnected = false;
        useFallback = true;
      });
  }
});
// ============ REDIS SETUP ============
const redisClient = redis.createClient({ url: REDIS_URL });
let redisConnected = false;

redisClient.connect().then(() => {
  console.log('✅ Connected to Redis successfully');
  redisConnected = true;
}).catch(err => {
  console.warn('⚠️ Could not connect to Redis. Using in-memory Redis fallback:', err.message);
});

const originalSet = redisClient.set.bind(redisClient);
const mockRedisCache = new Map();

redisClient.set = async function(key, value) {
  if (!redisConnected) {
    mockRedisCache.set(key, value);
    return 'OK';
  }

  try {
    return await originalSet(key, value);
  } catch (err) {
    mockRedisCache.set(key, value);
    return 'OK';
  }
};

const originalGet = redisClient.get ? redisClient.get.bind(redisClient) : null;

redisClient.get = async function(key) {
  if (!redisConnected || !originalGet) {
    return mockRedisCache.get(key);
  }

  try {
    return await originalGet(key);
  } catch (err) {
    return mockRedisCache.get(key);
  }
};

// ============ MQTT HEARTBEAT LISTENER ============
mqttClient.on('message', async (topic, message) => {
  try {
    if (topic.endsWith('/heartbeat')) {
      const payload = JSON.parse(message.toString());
      const deviceId = payload.device_id;

      if (deviceId) {
        console.log(`📡 MQTT heartbeat received from ${deviceId}`);

        await updateDeviceStatus(deviceId, 'online');
        setFallbackDeviceStatus(deviceId, 'online');
      }
    }
  } catch (err) {
    console.error('Error processing MQTT message:', err.message);
  }
});

// Background task: Check for inactive devices
setInterval(async () => {
  try {
    const threshold = new Date(Date.now() - 60000);

    ensureDefaultDevices();

    let changed = false;

    dbFallback.devices.forEach(d => {
      if (
        d.status === 'online' &&
        d.last_heartbeat &&
        new Date(d.last_heartbeat) < threshold
      ) {
        d.status = 'offline';
        changed = true;
        console.log(`⚠️ Device ${d.id} went offline (heartbeat timeout)`);
      }
    });

    if (changed) {
      saveFallback();
    }

    if (!useFallback) {
      await pool.query(
        "UPDATE devices SET status = 'offline' WHERE status = 'online' AND last_heartbeat < $1",
        [threshold]
      );
    }
  } catch (err) {
    console.error('Error running offline check:', err.message);
  }
}, 10000);

// ============ WEBSOCKET MANAGEMENT ============
const deviceConnections = new Map();

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  let deviceId = null;
  let isAuthenticated = false;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'auth') {
        deviceId = data.device_id;
        const apiKey = data.api_key;

        if (verifyApiKey(deviceId, apiKey)) {
          isAuthenticated = true;
          deviceConnections.set(deviceId, ws);

          await updateDeviceStatus(deviceId, 'online');
          setFallbackDeviceStatus(deviceId, 'online');

          console.log(`Device authenticated: ${deviceId}`);

          ws.send(JSON.stringify({
            type: 'auth_success',
            device_id: deviceId,
            timestamp: new Date().toISOString()
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'auth_failed',
            message: 'Invalid API key'
          }));

          ws.close();
        }
      } else if (data.type === 'heartbeat' && isAuthenticated) {
        await updateDeviceStatus(deviceId, 'online');
        setFallbackDeviceStatus(deviceId, 'online');

        console.log(`Heartbeat from ${deviceId}`);
      } else if (data.type === 'ack' && isAuthenticated) {
        await markNotificationAsSent(data.notification_id);
        console.log(`Notification acknowledged: ${data.notification_id}`);
      }
    } catch (error) {
      console.error('WebSocket message error:', error.message);
    }
  });

  ws.on('close', async () => {
    if (deviceId) {
      deviceConnections.delete(deviceId);

      await updateDeviceStatus(deviceId, 'offline');

      const device = dbFallback.devices.find(d => d.id === deviceId);
      if (device) {
        device.status = 'offline';
        saveFallback();
      }

      console.log(`Device disconnected: ${deviceId}`);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
});

// ============ REST API ENDPOINTS ============

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: '🎉 ESP32 Payment Notification System API',
    version: '1.0.0',
    status: 'running',
    project: {
      name: 'Thiết Bị Đọc Chuyển Khoản',
      field: 'Tài chính thông minh (FinTech IoT)',
      description: 'Hệ thống IoT tự động nhận thông báo thanh toán từ ngân hàng'
    },
    endpoints: {
      health: '/api/health',
      dashboard: '/api/v1/dashboard',
      devices: '/api/v1/devices',
      orders: '/api/v1/orders',
      webhook: '/sepay-webhook',
      stats: '/api/v1/orders/stats/summary',
      test_mqtt: '/api/test-mqtt'
    },
    frontend: 'https://esp32-ruddy.vercel.app',
    documentation: 'https://github.com/Escanor292/esp32'
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  ensureDefaultDevices();
  const dbOk = await checkDatabaseConnection();

  res.json({
    ok: true,
    message: 'API running on Vercel',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL ? 'vercel' : 'local',
    mqtt: {
      connected: typeof mqttClient.connected === 'boolean' ? mqttClient.connected : mqttClient.connected(),
      broker: MQTT_BROKER_URL,
      clientId: `backend-server-${STORE_ID}`
    },
    database: {
      connected: dbOk,
      usingFallback: !dbOk,
      hasDatabaseUrl: Boolean(DATABASE_URL)
    },
    fallback: {
      enabled: !dbOk,
      device_count: dbFallback.devices.length,
      devices: dbFallback.devices
    }
  });
});

// Test MQTT endpoint
app.post('/api/test-mqtt', async (req, res) => {
  try {
    const amount = req.body.amount || 99000;
    const txnCode = req.body.txnCode || `TEST_${Date.now().toString(36).toUpperCase()}`;
    const deviceId = req.body.device_id || STORE_ID;

    const topic = `payment/${deviceId}/new_order`;

    const payload = {
      id: `test-${Date.now()}`,
      device_id: deviceId,
      amount,
      txnCode,
      transferAmount: amount,
      content: txnCode,
      referenceCode: txnCode,
      gateway: 'TEST',
      transactionDate: new Date().toISOString()
    };

    const result = await publishMqttOnce(topic, payload);

    res.json({
      success: true,
      message: 'MQTT message sent successfully',
      topic: result.topic,
      payload: result.payload,
      broker: result.broker,
      clientId: result.clientId,
      qos: result.qos
    });
  } catch (error) {
    console.error('Test MQTT error:', error.message);

    res.status(500).json({
      success: false,
      message: 'MQTT publish failed',
      error: error.message
    });
  }
});

function normalizeOrderText(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// 0. SePay Webhook
async function handleSepayWebhook(req, res) {
  try {
    console.log('Received SePay Webhook:', JSON.stringify(req.body));

    const payload = req.body || {};
    const amount = Number(payload.transferAmount || payload.amount || 0);
    const transferType = payload.transferType || payload.type || '';
    const txnCode = payload.referenceCode || payload.content || `SEPAY_${payload.id || Date.now()}`;
    const rawContent = payload.content || '';
    const rawRef = payload.referenceCode || '';
    const combinedText = `${rawContent} ${rawRef}`;
    const normalizedWebhookText = normalizeOrderText(combinedText);

    if (transferType !== 'in' || amount <= 0) {
      return res.json({
        success: true,
        ignored: true,
        reason: 'Not incoming transfer or invalid amount',
        payload
      });
    }

    const mqttMessage = {
      id: Number(payload.id) || Date.now(),
      device_id: STORE_ID,
      gateway: payload.gateway || 'SEPAY',
      transactionDate: payload.transactionDate || new Date().toISOString(),
      transferAmount: amount,
      amount,
      content: rawContent || txnCode,
      referenceCode: rawRef || txnCode,
      txnCode
    };

    const topic = `payment/${STORE_ID}/incoming`;

    let mqttResult = null;

    try {
      mqttResult = await publishMqttOnce(topic, mqttMessage);
      console.log('✅ Payment incoming MQTT sent:', mqttResult);
    } catch (mqttError) {
      console.error('❌ Payment incoming MQTT failed:', mqttError.message);
    }

    if (await canUseDatabase()) {
      try {
        await pool.query(
          `INSERT INTO transactions
            (id, device_id, transaction_code, amount, status, gateway, bank_reference_id, content, reference_code, confirmed_at, created_at)
           VALUES
            ($1, $2, $3, $4, 'confirmed', $5, $6, $7, $8, NOW(), NOW())`,
          [
            uuidv4(),
            STORE_ID,
            txnCode,
            amount,
            payload.gateway || 'SEPAY',
            String(payload.id || ''),
            rawContent,
            rawRef
          ]
        );

        const pendingResult = await pool.query(
          `SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 100`
        );

        for (const order of pendingResult.rows) {
          const orderCode = order.transaction_code || order.txncode || order.reference_code || '';
          const normalizedOrderCode = normalizeOrderText(orderCode);
          const amountMatched = Math.abs(Number(order.total || 0) - amount) < 1;
          const codeMatched = normalizedOrderCode && normalizedWebhookText.includes(normalizedOrderCode);

          if (codeMatched || amountMatched) {
            await pool.query(
              `UPDATE orders
               SET status = 'confirmed',
                   confirmed_at = NOW(),
                   payment_gateway = $1,
                   bank_reference_id = $2,
                   webhook_content = $3,
                   webhook_reference_code = $4
               WHERE id = $5`,
              [payload.gateway || 'SEPAY', String(payload.id || ''), rawContent, rawRef, order.id]
            );
            console.log(`✅ Order ${order.id} auto-confirmed in PostgreSQL via webhook`);
            break;
          }
        }
      } catch (dbError) {
        console.error('⚠️ SePay PostgreSQL update failed, using fallback:', dbError.message);
        databaseConnected = false;
        useFallback = true;
      }
    }

    if (!dbFallback.transactions) dbFallback.transactions = [];

    const existingTx = dbFallback.transactions.find(t => (
      t.transaction_code === txnCode ||
      String(t.bank_reference_id || '') === String(payload.id || '')
    ));

    if (existingTx) {
      existingTx.status = 'confirmed';
      existingTx.amount = amount;
      existingTx.confirmed_at = new Date().toISOString();
      existingTx.bank_reference_id = String(payload.id || '');
      existingTx.gateway = payload.gateway || 'SEPAY';
      existingTx.content = rawContent;
      existingTx.referenceCode = rawRef;
      existingTx.transaction_code = txnCode;
      console.log(`✅ Existing transaction ${txnCode} updated to confirmed in fallback DB`);
    } else {
      dbFallback.transactions.push({
        id: uuidv4(),
        device_id: STORE_ID,
        transaction_code: txnCode,
        amount,
        status: 'confirmed',
        gateway: payload.gateway || 'SEPAY',
        bank_reference_id: String(payload.id || ''),
        content: rawContent,
        referenceCode: rawRef,
        confirmed_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
      console.log(`✅ New transaction ${txnCode} inserted in fallback DB`);
    }

    if (!dbFallback.orders) dbFallback.orders = [];

    const pendingOrder = dbFallback.orders.find(o => {
      const orderCode = o.transaction_code || o.txnCode || o.referenceCode || '';
      const normalizedOrderCode = normalizeOrderText(orderCode);

      const amountMatched = Math.abs(Number(o.total || 0) - amount) < 1;
      const codeMatched = normalizedOrderCode && normalizedWebhookText.includes(normalizedOrderCode);

      return o.status === 'pending' && (codeMatched || amountMatched);
    });

    if (pendingOrder) {
      pendingOrder.status = 'confirmed';
      pendingOrder.transaction_code = pendingOrder.transaction_code || txnCode;
      pendingOrder.confirmed_at = new Date().toISOString();
      pendingOrder.payment_gateway = payload.gateway || 'SEPAY';
      pendingOrder.bank_reference_id = String(payload.id || '');
      pendingOrder.webhook_content = rawContent;
      pendingOrder.webhook_reference_code = rawRef;
      console.log(`✅ Order ${pendingOrder.id} auto-confirmed via webhook`);
    }

    saveFallback();

    return res.json({
      success: true,
      message: 'Webhook processed',
      mqtt: mqttResult,
      transaction: {
        transaction_code: txnCode,
        amount,
        gateway: payload.gateway || 'SEPAY'
      }
    });
  } catch (error) {
    console.error('SePay webhook error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

app.post('/sepay-webhook', handleSepayWebhook);
app.post('/api/sepay-webhook', handleSepayWebhook);

// 0b. Create Order POS
app.post('/api/v1/orders', async (req, res) => {
  try {
    const { items, store_name } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Danh sách món không hợp lệ' });
    }

    const subtotal = items.reduce((sum, item) => {
      return sum + (Number(item.price || 0) * Number(item.quantity || 0));
    }, 0);

    const vat = Math.round(subtotal * 0.10);
    const total = subtotal + vat;
    const orderId = uuidv4();
    const txnCode = `ORDER_${Date.now().toString(36).toUpperCase()}`;

    let newOrder = {
      id: orderId,
      transaction_code: txnCode,
      store_name: store_name || 'Cửa Hàng',
      items,
      subtotal,
      vat,
      total,
      status: 'pending',
      confirmed_at: null,
      created_at: new Date().toISOString()
    };

    if (await canUseDatabase()) {
      try {
        await ensureDefaultDevicesInDb();
        const orderResult = await pool.query(
          `INSERT INTO orders
            (id, transaction_code, store_name, items, subtotal, vat, total, status, created_at)
           VALUES
            ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            newOrder.id,
            newOrder.transaction_code,
            newOrder.store_name,
            JSON.stringify(newOrder.items || []),
            newOrder.subtotal,
            newOrder.vat,
            newOrder.total,
            newOrder.status,
            newOrder.created_at
          ]
        );
        newOrder = mapOrderRow(orderResult.rows[0]);
      } catch (dbError) {
        console.error('⚠️ Create order in PostgreSQL failed, using fallback:', dbError.message);
        databaseConnected = false;
        useFallback = true;
      }
    }

    if (useFallback || !databaseConnected) {
      dbFallback.orders.push(newOrder);
      saveFallback();
    }

    const mqttMsg = {
      id: orderId,
      device_id: STORE_ID,
      amount: total,
      txnCode,
      transferAmount: total,
      content: txnCode,
      referenceCode: txnCode,
      gateway: 'POS',
      transactionDate: newOrder.created_at
    };

    const mqttTopic = `payment/${STORE_ID}/new_order`;

    try {
      await publishMqttOnce(mqttTopic, mqttMsg);
      console.log('✅ MQTT message published successfully to', mqttTopic);
    } catch (mqttError) {
      console.error('❌ MQTT publish failed:', mqttError.message);
    }

    res.json({ success: true, order: newOrder });
  } catch (error) {
    console.error('Create order error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// 0c. Get All Orders
app.get('/api/v1/orders', async (req, res) => {
  try {
    const { status, date } = req.query;

    if (await canUseDatabase()) {
      try {
        const where = [];
        const params = [];

        if (status) {
          params.push(status);
          where.push(`status = $${params.length}`);
        }

        if (date) {
          params.push(date);
          where.push(`created_at::date = $${params.length}`);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const result = await pool.query(
          `SELECT * FROM orders ${whereSql} ORDER BY created_at DESC`,
          params
        );

        return res.json({ orders: result.rows.map(mapOrderRow) });
      } catch (dbError) {
        console.error('⚠️ Get orders from PostgreSQL failed, using fallback:', dbError.message);
        databaseConnected = false;
        useFallback = true;
      }
    }

    let orders = [...(dbFallback.orders || [])];

    if (status) {
      orders = orders.filter(o => o.status === status);
    }

    if (date) {
      orders = orders.filter(o => o.created_at && o.created_at.startsWith(date));
    }

    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.json({ orders });
  } catch (error) {
    console.error('Get orders error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 0d. Get Order by ID
app.get('/api/v1/orders/:order_id', async (req, res) => {
  try {
    if (await canUseDatabase()) {
      try {
        const result = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.order_id]);
        if (result.rows.length > 0) {
          return res.json({ order: mapOrderRow(result.rows[0]) });
        }
      } catch (dbError) {
        console.error('⚠️ Get order by ID from PostgreSQL failed, using fallback:', dbError.message);
        databaseConnected = false;
        useFallback = true;
      }
    }

    const order = (dbFallback.orders || []).find(o => o.id === req.params.order_id);

    if (!order) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    }

    res.json({ order });
  } catch (error) {
    console.error('Get order by ID error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 0e. Sales Stats
app.get('/api/v1/orders/stats/summary', async (req, res) => {
  try {
    const { period, date } = req.query;

    if (await canUseDatabase()) {
      try {
        const targetDate = date || new Date().toISOString().split('T')[0];
        const isMonth = period === 'month';
        const params = [targetDate];
        const dateClause = isMonth
          ? `to_char(created_at, 'YYYY-MM') = $1`
          : `created_at::date = $1`;

        const orderStats = await pool.query(
          `SELECT
             COUNT(*) AS order_count,
             COALESCE(SUM(subtotal), 0) AS total_subtotal,
             COALESCE(SUM(vat), 0) AS total_vat,
             COALESCE(SUM(total), 0) AS total_revenue
           FROM orders
           WHERE status = 'confirmed' AND ${dateClause}`,
          params
        );

        const orderCount = Number(orderStats.rows[0]?.order_count || 0);
        if (orderCount > 0) {
          const itemRows = await pool.query(
            `SELECT
               item->>'name' AS name,
               COALESCE(SUM((item->>'quantity')::numeric), 0) AS quantity,
               COALESCE(MAX((item->>'price')::numeric), 0) AS price,
               COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::numeric), 0) AS revenue
             FROM orders o,
                  jsonb_array_elements(o.items) AS item
             WHERE o.status = 'confirmed' AND ${dateClause}
             GROUP BY item->>'name'
             ORDER BY revenue DESC`,
            params
          );

          return res.json({
            order_count: orderCount,
            total_subtotal: Number(orderStats.rows[0].total_subtotal || 0),
            total_vat: Number(orderStats.rows[0].total_vat || 0),
            total_revenue: Number(orderStats.rows[0].total_revenue || 0),
            item_stats: itemRows.rows.map(r => ({
              name: r.name,
              quantity: Number(r.quantity || 0),
              price: Number(r.price || 0),
              revenue: Number(r.revenue || 0)
            }))
          });
        }

        const txStats = await pool.query(
          `SELECT
             COUNT(*) AS order_count,
             COALESCE(SUM(amount), 0) AS total_revenue
           FROM transactions
           WHERE status = 'confirmed' AND ${dateClause}`,
          params
        );
        const txRevenue = Number(txStats.rows[0]?.total_revenue || 0);
        const txCount = Number(txStats.rows[0]?.order_count || 0);
        const txVat = Math.round(txRevenue / 11);

        return res.json({
          order_count: txCount,
          total_subtotal: Math.max(0, txRevenue - txVat),
          total_vat: txVat,
          total_revenue: txRevenue,
          item_stats: []
        });
      } catch (dbError) {
        console.error('⚠️ Summary stats PostgreSQL failed, using fallback:', dbError.message);
        databaseConnected = false;
        useFallback = true;
      }
    }

    let orders = (dbFallback.orders || []).filter(o => o.status === 'confirmed');

    if (period === 'month' && date) {
      const ym = date.substring(0, 7);
      orders = orders.filter(o => o.created_at && o.created_at.startsWith(ym));
    } else if (date) {
      orders = orders.filter(o => o.created_at && o.created_at.startsWith(date));
    } else {
      const today = new Date().toISOString().split('T')[0];
      orders = orders.filter(o => o.created_at && o.created_at.startsWith(today));
    }

    const itemMap = {};

    orders.forEach(order => {
      (order.items || []).forEach(item => {
        if (!itemMap[item.name]) {
          itemMap[item.name] = {
            name: item.name,
            price: Number(item.price || 0),
            quantity: 0,
            revenue: 0
          };
        }

        itemMap[item.name].quantity += Number(item.quantity || 0);
        itemMap[item.name].revenue += Number(item.price || 0) * Number(item.quantity || 0);
      });
    });

    const itemStats = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalSubtotal = orders.reduce((s, o) => s + Number(o.subtotal || 0), 0);
    const totalVat = orders.reduce((s, o) => s + Number(o.vat || 0), 0);

    res.json({
      order_count: orders.length,
      total_subtotal: totalSubtotal,
      total_vat: totalVat,
      total_revenue: totalRevenue,
      item_stats: itemStats
    });
  } catch (error) {
    console.error('Sales stats error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 0f. Monthly breakdown
app.get('/api/v1/orders/stats/monthly', async (req, res) => {
  try {
    const { year } = req.query;
    const y = year || new Date().getFullYear().toString();

    if (await canUseDatabase()) {
      try {
        const months = Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          label: `${String(i + 1).padStart(2, '0')}/${y}`,
          revenue: 0,
          order_count: 0
        }));

        const orderRows = await pool.query(
          `SELECT
             EXTRACT(MONTH FROM created_at)::int AS month,
             COALESCE(SUM(total), 0) AS revenue,
             COUNT(*) AS order_count
           FROM orders
           WHERE status = 'confirmed' AND EXTRACT(YEAR FROM created_at)::int = $1
           GROUP BY EXTRACT(MONTH FROM created_at)
           ORDER BY month`,
          [Number(y)]
        );

        if (orderRows.rows.length > 0) {
          orderRows.rows.forEach(r => {
            const idx = Number(r.month) - 1;
            if (idx >= 0 && idx < 12) {
              months[idx].revenue = Number(r.revenue || 0);
              months[idx].order_count = Number(r.order_count || 0);
            }
          });
        } else {
          const txRows = await pool.query(
            `SELECT
               EXTRACT(MONTH FROM created_at)::int AS month,
               COALESCE(SUM(amount), 0) AS revenue,
               COUNT(*) AS order_count
             FROM transactions
             WHERE status = 'confirmed' AND EXTRACT(YEAR FROM created_at)::int = $1
             GROUP BY EXTRACT(MONTH FROM created_at)
             ORDER BY month`,
            [Number(y)]
          );

          txRows.rows.forEach(r => {
            const idx = Number(r.month) - 1;
            if (idx >= 0 && idx < 12) {
              months[idx].revenue = Number(r.revenue || 0);
              months[idx].order_count = Number(r.order_count || 0);
            }
          });
        }

        return res.json({ year: y, months });
      } catch (dbError) {
        console.error('⚠️ Monthly stats PostgreSQL failed, using fallback:', dbError.message);
        databaseConnected = false;
        useFallback = true;
      }
    }

    const orders = (dbFallback.orders || []).filter(o => {
      return o.status === 'confirmed' &&
        o.created_at &&
        o.created_at.startsWith(y);
    });

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: `${String(i + 1).padStart(2, '0')}/${y}`,
      revenue: 0,
      order_count: 0
    }));

    orders.forEach(o => {
      const m = new Date(o.created_at).getMonth();
      months[m].revenue += Number(o.total || 0);
      months[m].order_count += 1;
    });

    res.json({ year: y, months });
  } catch (error) {
    console.error('Monthly stats error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 1. Register Device
app.post('/api/v1/devices/register', async (req, res) => {
  try {
    const { device_id, location_name, model } = req.body;

    if (!device_id) {
      return res.status(400).json({ error: 'device_id is required' });
    }

    ensureDefaultDevices();

    const existing = dbFallback.devices.find(d => d.id === device_id);

    if (existing) {
      return res.status(400).json({ error: 'Device already registered' });
    }

    const apiKey = `sk_live_${uuidv4()}`;

    const newDevice = {
      id: device_id,
      location_name: location_name || device_id,
      status: 'offline',
      last_heartbeat: null,
      config: { model: model || 'ESP32-DevKit' },
      created_at: new Date().toISOString()
    };

    dbFallback.devices.push(newDevice);
    saveFallback();

    await redisClient.set(`api_key:${device_id}`, apiKey);

    res.json({
      success: true,
      device_id,
      api_key: apiKey
    });
  } catch (error) {
    console.error('Register device error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 1b. Get all devices
app.get('/api/v1/devices', async (req, res) => {
  try {
    ensureDefaultDevices();

    let devices = [];

    if (await canUseDatabase()) {
      try {
        await ensureDefaultDevicesInDb();
        const result = await pool.query(
          'SELECT id, location_name, status, last_heartbeat FROM devices ORDER BY id'
        );
        devices = result.rows || [];
      } catch (dbError) {
        console.error('⚠️ Devices PostgreSQL query failed, using fallback:', dbError.message);
        databaseConnected = false;
        useFallback = true;
      }
    }

    if (!devices.length) {
      devices = getFallbackDevicesWithOfflineCheck();
    }

    // Nếu DB chính trả thiếu thiết bị thì merge thêm 3 fallback mặc định
    const fallbackDevices = getFallbackDevicesWithOfflineCheck();

    for (const fallbackDevice of fallbackDevices) {
      const exists = devices.find(d => d.id === fallbackDevice.id);

      if (!exists) {
        devices.push(fallbackDevice);
      }
    }

    const online = devices.filter(d => d.status === 'online').length;
    const offline = devices.filter(d => d.status !== 'online').length;

    res.json({
      devices,
      total: devices.length,
      online,
      offline,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get devices error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Request Transaction Code
app.post('/api/v1/transactions/request', authenticateDevice, async (req, res) => {
  try {
    const { device_id, amount, currency, description } = req.body;

    const transactionCode = generateTransactionCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const tx = {
      id: uuidv4(),
      device_id,
      transaction_code: transactionCode,
      amount: parseFloat(amount),
      status: 'pending',
      expires_at: expiresAt.toISOString(),
      confirmed_at: null,
      created_at: new Date().toISOString(),
      description: description || 'Dịch vụ ngoài'
    };

    dbFallback.transactions.push(tx);
    saveFallback();

    const qrData = `${transactionCode}|${amount}|${currency || 'VND'}`;

    res.json({
      transaction_code: transactionCode,
      qr_data: qrData,
      amount,
      currency: currency || 'VND',
      expires_at: expiresAt.toISOString()
    });
  } catch (error) {
    console.error('Request transaction code error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Confirm Payment
app.post('/api/v1/transactions/confirm', async (req, res) => {
  try {
    const { transaction_code, bank_reference_id, amount } = req.body;

    const transaction = (dbFallback.transactions || []).find(t => {
      return t.transaction_code === transaction_code && t.status === 'pending';
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (Math.abs(Number(transaction.amount || 0) - Number(amount || 0)) > 0.01) {
      return res.status(400).json({ error: 'Amount mismatch' });
    }

    transaction.status = 'confirmed';
    transaction.confirmed_at = new Date().toISOString();
    transaction.bank_reference_id = bank_reference_id || null;

    saveFallback();

    await queueNotification(
      transaction.device_id,
      transaction_code,
      amount
    );

    res.json({
      success: true,
      transaction_code,
      status: 'confirmed'
    });
  } catch (error) {
    console.error('Confirm payment error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Get Transaction History
app.get('/api/v1/transactions', async (req, res) => {
  try {
    const { device_id, date_from, date_to } = req.query;

    if (await canUseDatabase()) {
      try {
        const where = [];
        const params = [];
        if (device_id) {
          params.push(device_id);
          where.push(`device_id = $${params.length}`);
        }
        if (date_from) {
          params.push(date_from);
          where.push(`created_at >= $${params.length}::timestamptz`);
        }
        if (date_to) {
          params.push(`${date_to}T23:59:59.999Z`);
          where.push(`created_at <= $${params.length}::timestamptz`);
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const result = await pool.query(
          `SELECT * FROM transactions ${whereSql} ORDER BY created_at DESC LIMIT 500`,
          params
        );

        const transactions = result.rows.map(t => ({
          ...t,
          amount: Number(t.amount || 0)
        }));
        const dailyRevenue = transactions
          .filter(t => t.status === 'confirmed')
          .reduce((sum, t) => sum + Number(t.amount || 0), 0);

        return res.json({
          transactions,
          total: transactions.length,
          daily_revenue: dailyRevenue
        });
      } catch (dbError) {
        console.error('⚠️ Transactions PostgreSQL query failed, using fallback:', dbError.message);
        databaseConnected = false;
        useFallback = true;
      }
    }

    let transactions = [...(dbFallback.transactions || [])];

    if (device_id) {
      transactions = transactions.filter(t => t.device_id === device_id);
    }

    if (date_from) {
      const fromTime = new Date(date_from).getTime();
      transactions = transactions.filter(t => new Date(t.created_at).getTime() >= fromTime);
    }

    if (date_to) {
      const toTime = new Date(date_to).getTime();
      transactions = transactions.filter(t => new Date(t.created_at).getTime() <= toTime);
    }

    transactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const dailyRevenue = transactions
      .filter(t => t.status === 'confirmed')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    res.json({
      transactions,
      total: transactions.length,
      daily_revenue: dailyRevenue
    });
  } catch (error) {
    console.error('Get transaction history error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Get Device Status
app.get('/api/v1/devices/:device_id', async (req, res) => {
  try {
    const { device_id } = req.params;

    ensureDefaultDevices();

    let device = dbFallback.devices.find(d => d.id === device_id);

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const threshold = new Date(Date.now() - 60000);

    if (
      device.status === 'online' &&
      device.last_heartbeat &&
      new Date(device.last_heartbeat) < threshold
    ) {
      device.status = 'offline';
    }

    res.json(device);
  } catch (error) {
    console.error('Get device status error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5b. Device Heartbeat
app.post('/api/v1/devices/heartbeat', async (req, res) => {
  try {
    const { device_id, status } = req.body;

    if (!device_id) {
      return res.status(400).json({ error: 'device_id is required' });
    }

    console.log(`📡 Heartbeat received from ${device_id}`);

    ensureDefaultDevices();

    await updateDeviceStatus(device_id, status || 'online');

    const device = setFallbackDeviceStatus(device_id, status || 'online');

    console.log(`✅ Device ${device_id} status updated to ${device.status}`);

    res.json({
      success: true,
      device_id,
      status: status || 'online',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Heartbeat error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. Get Dashboard Data
app.get('/api/v1/dashboard', async (req, res) => {
  try {
    ensureDefaultDevices();
    if (await canUseDatabase()) {
      try {
        await ensureDefaultDevicesInDb();

        const devicesResult = await pool.query(
          'SELECT id, location_name, status, last_heartbeat FROM devices ORDER BY id'
        );
        const devices = devicesResult.rows || [];

        const txStats = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
           FROM transactions
           WHERE status = 'confirmed' AND created_at::date = CURRENT_DATE`
        );
        let dailyRevenue = Number(txStats.rows[0]?.total || 0);
        let transactionCount = Number(txStats.rows[0]?.count || 0);

        if (transactionCount === 0) {
          const orderStats = await pool.query(
            `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
             FROM orders
             WHERE status = 'confirmed' AND created_at::date = CURRENT_DATE`
          );
          dailyRevenue = Number(orderStats.rows[0]?.total || 0);
          transactionCount = Number(orderStats.rows[0]?.count || 0);
        }

        return res.json({
          devices,
          daily_revenue: dailyRevenue,
          transaction_count: transactionCount,
          timestamp: new Date().toISOString()
        });
      } catch (dbError) {
        console.error('⚠️ Dashboard PostgreSQL query failed, using fallback:', dbError.message);
        databaseConnected = false;
        useFallback = true;
      }
    }

    const devices = getFallbackDevicesWithOfflineCheck();
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = (dbFallback.orders || []).filter(order => {
      return order.status === 'confirmed' && order.created_at && order.created_at.startsWith(today);
    });

    return res.json({
      devices,
      daily_revenue: todayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
      transaction_count: todayOrders.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get dashboard data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/init-db', async (req, res) => {
  try {
    await initDatabaseTables();
    databaseConnected = true;
    useFallback = false;

    res.json({
      success: true,
      message: 'Database initialized',
      tables: ['devices', 'transactions', 'orders', 'notification_queue']
    });
  } catch (error) {
    console.error('Init DB error:', error);
    databaseConnected = false;
    useFallback = true;

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/seed-fake-data', async (req, res) => {
  try {
    if (!(await canUseDatabase())) {
      return res.status(503).json({
        success: false,
        error: 'Database is not available'
      });
    }

    const menu = [
      { name: 'Cà phê đen', price: 25000 },
      { name: 'Trà đào', price: 35000 },
      { name: 'Bánh flan', price: 22000 },
      { name: 'Kẹo', price: 3000 },
      { name: 'Cà phê sữa đá', price: 29000 }
    ];

    await pool.query('BEGIN');

    for (let i = 1; i <= 30; i++) {
      const code = `ORDER_FAKE_${String(i).padStart(3, '0')}`;
      const orderId = `fake-order-${String(i).padStart(3, '0')}`;
      const txId = `fake-tx-${String(i).padStart(3, '0')}`;
      const createdAt = new Date(Date.now() - i * 2 * 60 * 1000).toISOString();

      const itemA = menu[i % menu.length];
      const itemB = menu[(i + 1) % menu.length];
      const items = [
        { name: itemA.name, price: itemA.price, quantity: (i % 3) + 1 },
        { name: itemB.name, price: itemB.price, quantity: ((i + 1) % 2) + 1 }
      ];
      // Ensure "Kẹo" appears in several fake orders.
      if (i % 4 === 0) {
        items.push({ name: 'Kẹo', price: 3000, quantity: 2 });
      }

      const subtotal = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
      const vat = Math.round(subtotal * 0.10);
      const total = subtotal + vat;

      await pool.query(
        `INSERT INTO orders
          (id, transaction_code, store_name, items, subtotal, vat, total, status, payment_gateway, confirmed_at, created_at)
         VALUES
          ($1, $2, $3, $4::jsonb, $5, $6, $7, 'confirmed', $8, $9, $10)
         ON CONFLICT (transaction_code) DO UPDATE
         SET status = 'confirmed',
             subtotal = EXCLUDED.subtotal,
             vat = EXCLUDED.vat,
             total = EXCLUDED.total,
             items = EXCLUDED.items,
             payment_gateway = EXCLUDED.payment_gateway,
             confirmed_at = EXCLUDED.confirmed_at`,
        [orderId, code, 'Quán Cà Phê', JSON.stringify(items), subtotal, vat, total, 'MBBank', createdAt, createdAt]
      );

      await pool.query(
        `INSERT INTO transactions
          (id, device_id, transaction_code, amount, status, gateway, content, reference_code, confirmed_at, created_at)
         VALUES
          ($1, $2, $3, $4, 'confirmed', $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE
         SET status = 'confirmed',
             amount = EXCLUDED.amount,
             gateway = EXCLUDED.gateway,
             confirmed_at = EXCLUDED.confirmed_at`,
        [txId, 'store_001', code, total, 'MBBank', code, code, createdAt, createdAt]
      );
    }

    await pool.query('COMMIT');

    return res.json({
      success: true,
      message: 'Seeded 30 fake transactions',
      count: 30
    });
  } catch (error) {
    try {
      await pool.query('ROLLBACK');
    } catch (_) {}
    console.error('Seed fake data error:', error.message || error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// ============ HELPER FUNCTIONS ============

function generateTransactionCode() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN${timestamp}${random}`;
}

function verifyApiKey(deviceId, apiKey) {
  // Demo/internal project: allow all.
  // Production nên kiểm tra API key thật trong Redis/DB.
  return true;
}

async function updateDeviceStatus(deviceId, status) {
  try {
    ensureDefaultDevices();
    if (await canUseDatabase()) {
      await ensureDefaultDevicesInDb();
      await pool.query(
        `INSERT INTO devices (id, location_name, status, last_heartbeat, config)
         VALUES ($1, $2, $3, NOW(), $4::jsonb)
         ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status, last_heartbeat = NOW()`,
        [
          deviceId,
          deviceId === 'store_001' ? 'Quầy Thu Ngân 1' : deviceId,
          status,
          JSON.stringify({ model: 'ESP32-DevKit' })
        ]
      );
    }

    setFallbackDeviceStatus(deviceId, status);
  } catch (error) {
    console.error('Update device status error:', error.message);
    databaseConnected = false;
    useFallback = true;
    setFallbackDeviceStatus(deviceId, status);
  }
}

async function queueNotification(deviceId, transactionCode, amount) {
  try {
    const notificationId = uuidv4();

    const newNotif = {
      id: notificationId,
      device_id: deviceId,
      transaction_code: transactionCode,
      amount: parseFloat(amount),
      status: 'pending',
      created_at: new Date().toISOString(),
      sent_at: null
    };

    dbFallback.notification_queue.push(newNotif);
    saveFallback();

    if (await canUseDatabase()) {
      try {
        await pool.query(
          `INSERT INTO notification_queue
            (id, device_id, transaction_code, amount, status, created_at)
           VALUES
            ($1, $2, $3, $4, $5, $6)`,
          [notificationId, deviceId, transactionCode, parseFloat(amount), 'pending', new Date().toISOString()]
        );
      } catch (dbError) {
        console.error('⚠️ Notification insert PostgreSQL failed:', dbError.message);
        databaseConnected = false;
        useFallback = true;
      }
    }

    const ws = deviceConnections.get(deviceId);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'payment_confirmed',
        notification_id: notificationId,
        transaction_code: transactionCode,
        amount,
        timestamp: new Date().toISOString()
      }));

      await markNotificationAsSent(notificationId);
    }
  } catch (error) {
    console.error('Queue notification error:', error.message);
  }
}

async function markNotificationAsSent(notificationId) {
  try {
    const notif = (dbFallback.notification_queue || []).find(n => n.id === notificationId);

    if (notif) {
      notif.status = 'sent';
      notif.sent_at = new Date().toISOString();
      saveFallback();
    }

    if (await canUseDatabase()) {
      await pool.query(
        'UPDATE notification_queue SET status = $1, sent_at = $2 WHERE id = $3',
        ['sent', new Date(), notificationId]
      );
    }
  } catch (error) {
    console.error('Mark notification as sent error:', error.message);
    databaseConnected = false;
    useFallback = true;
  }
}

// ============ MIDDLEWARE ============

function authenticateDevice(req, res, next) {
  const authHeader = req.headers.authorization;

  // Demo/internal dashboard cho phép bỏ qua auth ở một số endpoint.
  // Các endpoint cần bảo vệ vẫn đi qua middleware này.
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

// ============ ERROR HANDLING ============

app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);

  res.status(500).json({
    error: 'Internal server error'
  });
});

// ============ START SERVER ============

// Only start server if not running on Vercel
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`Payment Notification Backend running on port ${PORT}`);
    console.log(`WebSocket server ready at ws://localhost:${PORT}`);
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');

    server.close(async () => {
      console.log('Server closed');

      try {
        await pool.end();
      } catch (err) {
        console.error('Pool end error:', err.message);
      }

      try {
        await redisClient.quit();
      } catch (err) {
        console.error('Redis quit error:', err.message);
      }

      process.exit(0);
    });
  });
} else {
  console.log('Running on Vercel serverless - skipping server.listen()');
}

// Export app for Vercel serverless
module.exports = app;