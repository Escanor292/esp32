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
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// ============ SEPAY & MQTT CONFIG ============
const SEPAY_API_KEY = process.env.SEPAY_API_KEY || 'your_sepay_api_key';
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
const STORE_ID = process.env.STORE_ID || 'store_001';

// ============ MQTT CLIENT ============
const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
  clientId: `backend-server-${STORE_ID}`,
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000,
});

mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT Broker');
});

mqttClient.on('error', (error) => {
  console.error('❌ MQTT Error:', error);
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
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// ============ DATABASE SETUP (PostgreSQL) ============
const pool = new Pool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: DB_PORT,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Database and Redis Fallback Logic (Zero Config)
const fs = require('fs');
const path = require('path');
const DB_FALLBACK_FILE = path.join(__dirname, 'db_fallback.json');

let useFallback = false;
let dbFallback = {
  devices: [
    { id: 'store_001', location_name: 'Quầy Thu Ngân 1', status: 'offline', last_heartbeat: null, config: { model: 'ESP32-DevKit' }, created_at: new Date().toISOString() }
  ],
  transactions: [],
  notification_queue: [],
  orders: []
};

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

function saveFallback() {
  try {
    fs.writeFileSync(DB_FALLBACK_FILE, JSON.stringify(dbFallback, null, 2), 'utf8');
  } catch (err) {
    console.error('⚠️ Could not save fallback database:', err);
  }
}

const fallbackQuery = async (text, params) => {
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
    const rows = dbFallback.devices.map(d => ({
      id: d.id,
      location_name: d.location_name,
      status: d.status,
      last_heartbeat: d.last_heartbeat
    }));
    return { rows };
  }
  
  if (sql.includes('INSERT INTO devices')) {
    const [id, location_name, status, configStr] = p;
    const config = configStr ? JSON.parse(configStr) : {};
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
    const device = dbFallback.devices.find(d => d.id === id);
    if (device) {
      device.status = status;
      device.last_heartbeat = last_heartbeat;
      saveFallback();
    }
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
    } else {
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
  }
  
  if (sql.includes('SELECT * FROM transactions WHERE transaction_code =') && sql.includes('status =')) {
    const [code, status] = p;
    const rows = dbFallback.transactions.filter(t => t.transaction_code === code && t.status === status);
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
      .filter(t => t.device_id === device_id && new Date(t.created_at).getTime() >= fromTime && new Date(t.created_at).getTime() <= toTime)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { rows };
  }
  
  if (sql.includes('SELECT SUM(amount) as total FROM transactions')) {
    const [status, dateStr] = p;
    const targetDate = new Date(dateStr).toDateString();
    const filtered = dbFallback.transactions.filter(t => t.status === status && new Date(t.created_at).toDateString() === targetDate);
    const total = filtered.reduce((sum, t) => sum + t.amount, 0);
    return { rows: [{ total }] };
  }
  
  if (sql.includes('SELECT COUNT(*) as count FROM transactions')) {
    const [status, dateStr] = p;
    const targetDate = new Date(dateStr).toDateString();
    const filtered = dbFallback.transactions.filter(t => t.status === status && new Date(t.created_at).toDateString() === targetDate);
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
    console.error('❌ PostgreSQL query failed, switching to local database fallback.');
    useFallback = true;
    return fallbackQuery(text, params);
  }
};

pool.connect((err, client, release) => {
  if (err) {
    console.warn('⚠️ Could not connect to PostgreSQL database. Using local JSON fallback database (db_fallback.json)');
    useFallback = true;
  } else {
    console.log('✅ Connected to PostgreSQL database successfully');
    release();
  }
});

// ============ REDIS SETUP ============
const redisClient = redis.createClient({ url: REDIS_URL });
let redisConnected = false;

redisClient.connect().then(() => {
  console.log('✅ Connected to Redis successfully');
  redisConnected = true;
}).catch(err => {
  console.warn('⚠️ Could not connect to Redis. Using in-memory Redis fallback.');
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

// ============ WEBSOCKET MANAGEMENT ============
const deviceConnections = new Map(); // device_id -> WebSocket

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  let deviceId = null;
  let isAuthenticated = false;
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Authentication
      if (data.type === 'auth') {
        deviceId = data.device_id;
        const apiKey = data.api_key;
        
        // Verify API key (simplified)
        if (verifyApiKey(deviceId, apiKey)) {
          isAuthenticated = true;
          deviceConnections.set(deviceId, ws);
          
          // Update device status
          await updateDeviceStatus(deviceId, 'online');
          
          console.log(`Device authenticated: ${deviceId}`);
          
          // Send acknowledgment
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
      }
      
      // Heartbeat
      else if (data.type === 'heartbeat' && isAuthenticated) {
        await updateDeviceStatus(deviceId, 'online');
        console.log(`Heartbeat from ${deviceId}`);
      }
      
      // Acknowledge notification
      else if (data.type === 'ack' && isAuthenticated) {
        await markNotificationAsSent(data.notification_id);
        console.log(`Notification acknowledged: ${data.notification_id}`);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', async () => {
    if (deviceId) {
      deviceConnections.delete(deviceId);
      await updateDeviceStatus(deviceId, 'offline');
      console.log(`Device disconnected: ${deviceId}`);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// ============ REST API ENDPOINTS ============

// 0. SePay Webhook
app.post('/sepay-webhook', async (req, res) => {
  try {
    console.log('Received SePay Webhook');

    const payload = req.body;
    
    if (payload.transferType === 'in' && payload.transferAmount > 0) {
      const mqttMessage = {
        id: payload.id,
        gateway: payload.gateway,
        transactionDate: payload.transactionDate,
        transferAmount: payload.transferAmount,
        content: payload.content,
        referenceCode: payload.referenceCode
      };

      // Publish to MQTT
      const topic = `payment/${STORE_ID}/incoming`;
      mqttClient.publish(topic, JSON.stringify(mqttMessage), { qos: 1 });
      
      console.log(`✅ Payment notified via MQTT: ${payload.transferAmount} VND`);

      const txnCode = payload.referenceCode || `SEPAY_${payload.id}`;
      
      // Record in DB
      if (useFallback) {
        // Find existing transaction in fallback database
        const existingTx = dbFallback.transactions.find(t => t.transaction_code === txnCode);
        if (existingTx) {
          existingTx.status = 'confirmed';
          existingTx.confirmed_at = new Date().toISOString();
          existingTx.bank_reference_id = payload.id.toString();
          console.log(`✅ Existing transaction ${txnCode} updated to confirmed in fallback DB`);
        } else {
          // Insert new transaction
          dbFallback.transactions.push({
            id: uuidv4(),
            device_id: 'store_001',
            transaction_code: txnCode,
            amount: payload.transferAmount,
            status: 'confirmed',
            confirmed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            description: 'Chuyển khoản trực tiếp'
          });
          console.log(`✅ New transaction ${txnCode} inserted in fallback DB`);
        }
        saveFallback();
      } else {
        // PostgreSQL: Check if transaction already exists
        const existingTxResult = await pool.query(
          'SELECT * FROM transactions WHERE transaction_code = $1',
          [txnCode]
        );
        if (existingTxResult.rows.length > 0) {
          await pool.query(
            `UPDATE transactions 
             SET status = $1, confirmed_at = $2, bank_reference_id = $3 
             WHERE transaction_code = $4`,
            ['confirmed', new Date(), payload.id.toString(), txnCode]
          );
          console.log(`✅ Existing transaction ${txnCode} updated to confirmed in PostgreSQL`);
        } else {
          await pool.query(
            'INSERT INTO transactions (id, transaction_code, amount, status) VALUES ($1, $2, $3, $4)',
            [uuidv4(), txnCode, payload.transferAmount, 'confirmed']
          );
          console.log(`✅ New transaction ${txnCode} inserted in PostgreSQL`);
        }
      }

      // Auto-confirm any pending order matching this amount
      if (useFallback) {
        const pendingOrder = dbFallback.orders.find(
          o => o.status === 'pending' && Math.abs(o.total - payload.transferAmount) < 1
        );
        if (pendingOrder) {
          pendingOrder.status = 'confirmed';
          pendingOrder.transaction_code = txnCode;
          pendingOrder.confirmed_at = new Date().toISOString();
          saveFallback();
          console.log(`✅ Order ${pendingOrder.id} auto-confirmed via webhook`);
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('SePay webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 0b. Create Order (POS)
app.post('/api/v1/orders', async (req, res) => {
  try {
    const { items, store_name } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Danh sách món không hợp lệ' });
    }
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const vat = Math.round(subtotal * 0.10);
    const total = subtotal + vat;
    const orderId = uuidv4();
    const txnCode = `ORDER_${Date.now().toString(36).toUpperCase()}`;

    const newOrder = {
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

    if (useFallback) {
      dbFallback.orders.push(newOrder);
      saveFallback();
    }

    // Push QR hint via MQTT so ESP32 can update its display
    const mqttMsg = { id: orderId, transferAmount: total, content: txnCode, gateway: 'POS', transactionDate: newOrder.created_at, referenceCode: txnCode };
    mqttClient.publish(`payment/${STORE_ID}/new_order`, JSON.stringify(mqttMsg), { qos: 1 });

    res.json({ success: true, order: newOrder });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 0c. Get All Orders
app.get('/api/v1/orders', async (req, res) => {
  try {
    const { status, date } = req.query;
    let orders = useFallback ? [...dbFallback.orders] : [];
    if (status) orders = orders.filter(o => o.status === status);
    if (date) orders = orders.filter(o => o.created_at && o.created_at.startsWith(date));
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 0d. Get Order by ID
app.get('/api/v1/orders/:order_id', async (req, res) => {
  try {
    const order = useFallback ? dbFallback.orders.find(o => o.id === req.params.order_id) : null;
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    res.json({ order });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 0e. Sales Stats
app.get('/api/v1/orders/stats/summary', async (req, res) => {
  try {
    const { period, date } = req.query; // period: 'day' | 'month'
    let orders = useFallback ? dbFallback.orders.filter(o => o.status === 'confirmed') : [];
    
    if (period === 'month' && date) {
      const ym = date.substring(0, 7); // YYYY-MM
      orders = orders.filter(o => o.created_at && o.created_at.startsWith(ym));
    } else if (date) {
      orders = orders.filter(o => o.created_at && o.created_at.startsWith(date));
    } else {
      const today = new Date().toISOString().split('T')[0];
      orders = orders.filter(o => o.created_at && o.created_at.startsWith(today));
    }

    // Aggregate by item
    const itemMap = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        if (!itemMap[item.name]) itemMap[item.name] = { name: item.name, price: item.price, quantity: 0, revenue: 0 };
        itemMap[item.name].quantity += item.quantity;
        itemMap[item.name].revenue += item.price * item.quantity;
      });
    });
    const itemStats = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
    const totalSubtotal = orders.reduce((s, o) => s + o.subtotal, 0);
    const totalVat = orders.reduce((s, o) => s + o.vat, 0);

    res.json({
      order_count: orders.length,
      total_subtotal: totalSubtotal,
      total_vat: totalVat,
      total_revenue: totalRevenue,
      item_stats: itemStats
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 0f. Monthly breakdown
app.get('/api/v1/orders/stats/monthly', async (req, res) => {
  try {
    const { year } = req.query;
    const y = year || new Date().getFullYear().toString();
    const orders = useFallback ? dbFallback.orders.filter(o => o.status === 'confirmed' && o.created_at && o.created_at.startsWith(y)) : [];
    
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: `${String(i + 1).padStart(2,'0')}/${y}`,
      revenue: 0,
      order_count: 0
    }));
    orders.forEach(o => {
      const m = new Date(o.created_at).getMonth();
      months[m].revenue += o.total;
      months[m].order_count += 1;
    });
    res.json({ year: y, months });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 1. Register Device
app.post('/api/v1/devices/register', async (req, res) => {
  try {
    const { device_id, location_name, model } = req.body;
    
    // Check if device already exists
    const result = await pool.query(
      'SELECT id FROM devices WHERE id = $1',
      [device_id]
    );
    
    if (result.rows.length > 0) {
      return res.status(400).json({ error: 'Device already registered' });
    }
    
    // Insert new device
    const apiKey = `sk_live_${uuidv4()}`;
    await pool.query(
      'INSERT INTO devices (id, location_name, status, config) VALUES ($1, $2, $3, $4)',
      [device_id, location_name, 'offline', JSON.stringify({ model })]
    );
    
    // Store API key in Redis
    await redisClient.set(`api_key:${device_id}`, apiKey);
    
    res.json({
      success: true,
      device_id,
      api_key: apiKey
    });
  } catch (error) {
    console.error('Register device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Request Transaction Code
app.post('/api/v1/transactions/request', authenticateDevice, async (req, res) => {
  try {
    const { device_id, amount, currency, description } = req.body;
    const transactionCode = generateTransactionCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    
    // Insert transaction
    if (useFallback) {
      dbFallback.transactions.push({
        id: uuidv4(),
        device_id,
        transaction_code: transactionCode,
        amount: parseFloat(amount),
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        confirmed_at: null,
        created_at: new Date().toISOString(),
        description: description || 'Dịch vụ ngoài'
      });
      saveFallback();
    } else {
      await pool.query(
        `INSERT INTO transactions 
         (id, device_id, transaction_code, amount, status, expires_at) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), device_id, transactionCode, amount, 'pending', expiresAt]
      );
    }
    
    const qrData = `${transactionCode}|${amount}|${currency}`;
    
    res.json({
      transaction_code: transactionCode,
      qr_data: qrData,
      amount,
      currency,
      expires_at: expiresAt.toISOString()
    });
  } catch (error) {
    console.error('Request transaction code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Confirm Payment (from Bank)
app.post('/api/v1/transactions/confirm', async (req, res) => {
  try {
    const { transaction_code, bank_reference_id, amount, timestamp } = req.body;
    
    // Find transaction
    const result = await pool.query(
      'SELECT * FROM transactions WHERE transaction_code = $1 AND status = $2',
      [transaction_code, 'pending']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const transaction = result.rows[0];
    
    // Validate amount
    if (Math.abs(transaction.amount - amount) > 0.01) {
      return res.status(400).json({ error: 'Amount mismatch' });
    }
    
    // Update transaction
    await pool.query(
      `UPDATE transactions 
       SET status = $1, confirmed_at = $2, bank_reference_id = $3 
       WHERE transaction_code = $4`,
      ['confirmed', new Date(), bank_reference_id, transaction_code]
    );
    
    // Queue notification to device
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
    console.error('Confirm payment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Get Transaction History
app.get('/api/v1/transactions', authenticateDevice, async (req, res) => {
  try {
    const { device_id, date_from, date_to } = req.query;
    
    const result = await pool.query(
      `SELECT * FROM transactions 
       WHERE device_id = $1 AND created_at BETWEEN $2 AND $3
       ORDER BY created_at DESC`,
      [device_id, date_from, date_to]
    );
    
    const transactions = result.rows;
    
    // Calculate daily revenue
    const dailyRevenue = transactions
      .filter(t => t.status === 'confirmed')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    
    res.json({
      transactions,
      total: transactions.length,
      daily_revenue: dailyRevenue
    });
  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Get Device Status
app.get('/api/v1/devices/:device_id', authenticateDevice, async (req, res) => {
  try {
    const { device_id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM devices WHERE id = $1',
      [device_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get device status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. Get Dashboard Data
app.get('/api/v1/dashboard', async (req, res) => {
  try {
    // Get all devices
    const devicesResult = await pool.query(
      'SELECT id, location_name, status, last_heartbeat FROM devices'
    );
    
    // Get today's revenue
    const today = new Date().toISOString().split('T')[0];
    const revenueResult = await pool.query(
      `SELECT SUM(amount) as total FROM transactions 
       WHERE status = $1 AND created_at::date = $2`,
      ['confirmed', today]
    );
    
    // Get transaction count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM transactions 
       WHERE status = $1 AND created_at::date = $2`,
      ['confirmed', today]
    );
    
    res.json({
      devices: devicesResult.rows,
      daily_revenue: parseFloat(revenueResult.rows[0].total) || 0,
      transaction_count: parseInt(countResult.rows[0].count) || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get dashboard data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ HELPER FUNCTIONS ============

function generateTransactionCode() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN${timestamp}${random}`;
}

function verifyApiKey(deviceId, apiKey) {
  return true;
}

async function updateDeviceStatus(deviceId, status) {
  try {
    await pool.query(
      'UPDATE devices SET status = $1, last_heartbeat = $2 WHERE id = $3',
      [status, new Date(), deviceId]
    );
  } catch (error) {
    console.error('Update device status error:', error);
  }
}

async function queueNotification(deviceId, transactionCode, amount) {
  try {
    const notificationId = uuidv4();
    
    await pool.query(
      `INSERT INTO notification_queue 
       (id, device_id, transaction_code, amount, status) 
       VALUES ($1, $2, $3, $4, $5)`,
      [notificationId, deviceId, transactionCode, amount, 'pending']
    );
    
    // Send notification to device if connected
    const ws = deviceConnections.get(deviceId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'payment_confirmed',
        notification_id: notificationId,
        transaction_code: transactionCode,
        amount,
        timestamp: new Date().toISOString()
      }));
    }
  } catch (error) {
    console.error('Queue notification error:', error);
  }
}

async function markNotificationAsSent(notificationId) {
  try {
    await pool.query(
      'UPDATE notification_queue SET status = $1, sent_at = $2 WHERE id = $3',
      ['sent', new Date(), notificationId]
    );
  } catch (error) {
    console.error('Mark notification as sent error:', error);
  }
}

// ============ MIDDLEWARE ============

function authenticateDevice(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// ============ ERROR HANDLING ============

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============ START SERVER ============

server.listen(PORT, () => {
  console.log(`Payment Notification Backend (PostgreSQL) running on port ${PORT}`);
  console.log(`WebSocket server ready at ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(async () => {
    console.log('Server closed');
    await pool.end();
    process.exit(0);
  });
});
