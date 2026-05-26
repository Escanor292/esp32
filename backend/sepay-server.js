/*
 * SePay Webhook Server - Trung Gian Giữa SePay và ESP32
 * Nhận Webhook từ SePay, publish lên MQTT Broker
 */

const express = require('express');
const mqtt = require('mqtt');
const dotenv = require('dotenv');
const crypto = require('crypto');

dotenv.config();

const app = express();
app.use(express.json());

// ============ CONFIGURATION ============
const SEPAY_API_KEY = process.env.SEPAY_API_KEY || 'your_sepay_api_key';
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
const STORE_ID = process.env.STORE_ID || 'store_001';
const PORT = process.env.PORT || 3000;

// ============ MQTT CLIENT ============
const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
  clientId: `sepay-server-${STORE_ID}`,
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000,
});

mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT Broker');
  console.log(`   Broker: ${MQTT_BROKER_URL}`);
});

mqttClient.on('error', (error) => {
  console.error('❌ MQTT Error:', error);
});

mqttClient.on('disconnect', () => {
  console.log('⚠️  Disconnected from MQTT Broker');
});

// ============ LOGGING ============
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = {
    'INFO': '📝',
    'SUCCESS': '✅',
    'ERROR': '❌',
    'WARNING': '⚠️ ',
    'DEBUG': '🔍'
  }[level] || '•';
  
  console.log(`[${timestamp}] ${prefix} ${message}`);
  if (data) {
    console.log('   ', JSON.stringify(data, null, 2));
  }
}

// ============ SEPAY WEBHOOK ENDPOINT ============
app.post('/sepay-webhook', (req, res) => {
  try {
    log('INFO', 'Received SePay Webhook');

    // 1. Xác thực API Key
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      log('ERROR', 'Missing Authorization header');
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const expectedAuth = `Bearer ${SEPAY_API_KEY}`;
    if (authHeader !== expectedAuth) {
      log('ERROR', 'Invalid API Key');
      return res.status(401).json({ error: 'Invalid API Key' });
    }

    // 2. Parse payload
    const payload = req.body;
    log('DEBUG', 'Webhook Payload', payload);

    // 3. Validate required fields
    const requiredFields = ['id', 'gateway', 'transferType', 'transferAmount', 'transactionDate'];
    for (const field of requiredFields) {
      if (!(field in payload)) {
        log('ERROR', `Missing required field: ${field}`);
        return res.status(400).json({ error: `Missing field: ${field}` });
      }
    }

    // 4. Kiểm tra transferType
    if (payload.transferType !== 'in') {
      log('INFO', `Ignored transfer (type: ${payload.transferType})`);
      return res.status(200).json({ 
        success: true, 
        message: 'Ignored (not incoming transfer)' 
      });
    }

    // 5. Validate amount
    if (payload.transferAmount <= 0) {
      log('ERROR', 'Invalid transfer amount');
      return res.status(400).json({ error: 'Invalid transfer amount' });
    }

    // 6. Tạo message cho MQTT
    const mqttMessage = {
      id: payload.id,
      gateway: payload.gateway,
      transactionDate: payload.transactionDate,
      accountNumber: payload.accountNumber,
      transferAmount: payload.transferAmount,
      accumulated: payload.accumulated,
      content: payload.content,
      referenceCode: payload.referenceCode,
      receivedAt: new Date().toISOString()
    };

    // 7. Publish lên MQTT
    const topic = `payment/${STORE_ID}/incoming`;
    
    mqttClient.publish(
      topic,
      JSON.stringify(mqttMessage),
      { qos: 1, retain: false },
      (err) => {
        if (err) {
          log('ERROR', 'MQTT publish failed', err);
          return res.status(500).json({ error: 'Failed to publish to MQTT' });
        }

        log('SUCCESS', `Published to MQTT topic: ${topic}`);
        log('DEBUG', 'Message', mqttMessage);

        res.json({
          success: true,
          message: 'Webhook processed successfully',
          transactionId: payload.id,
          amount: payload.transferAmount,
          topic: topic
        });
      }
    );

  } catch (error) {
    log('ERROR', 'Webhook processing error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mqtt: mqttClient.connected ? 'connected' : 'disconnected',
    storeId: STORE_ID
  });
});

// ============ STATS ENDPOINT ============
let webhookStats = {
  totalReceived: 0,
  totalProcessed: 0,
  totalIgnored: 0,
  totalErrors: 0,
  lastTransaction: null,
  startTime: new Date()
};

app.get('/stats', (req, res) => {
  res.json({
    ...webhookStats,
    uptime: Math.floor((Date.now() - webhookStats.startTime.getTime()) / 1000)
  });
});

// ============ TEST ENDPOINT ============
app.post('/test-webhook', (req, res) => {
  try {
    const testPayload = {
      id: Math.floor(Math.random() * 1000000),
      gateway: 'Vietcombank',
      transactionDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
      accountNumber: '0123456789',
      subAccount: null,
      transferType: 'in',
      transferAmount: 150000,
      accumulated: 150000,
      code: null,
      content: 'Test payment',
      referenceCode: `TEST${Date.now()}`
    };

    const topic = `payment/${STORE_ID}/incoming`;
    
    mqttClient.publish(
      topic,
      JSON.stringify(testPayload),
      { qos: 1 },
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to publish' });
        }

        log('SUCCESS', 'Test webhook published');
        res.json({
          success: true,
          message: 'Test webhook published',
          payload: testPayload,
          topic: topic
        });
      }
    );

  } catch (error) {
    log('ERROR', 'Test webhook error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ DOCUMENTATION ============
app.get('/', (req, res) => {
  res.json({
    name: 'SePay Webhook Server',
    version: '1.0.0',
    description: 'Trung gian giữa SePay và ESP32 MQTT',
    endpoints: {
      'POST /sepay-webhook': 'Nhận webhook từ SePay',
      'GET /health': 'Kiểm tra trạng thái server',
      'GET /stats': 'Xem thống kê',
      'POST /test-webhook': 'Gửi webhook test'
    },
    configuration: {
      storeId: STORE_ID,
      mqttBroker: MQTT_BROKER_URL,
      mqttTopic: `payment/${STORE_ID}/incoming`
    }
  });
});

// ============ ERROR HANDLING ============
app.use((err, req, res, next) => {
  log('ERROR', 'Unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============ 404 HANDLER ============
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ============ START SERVER ============
app.listen(PORT, () => {
  log('SUCCESS', `Server running on port ${PORT}`);
  log('INFO', `Store ID: ${STORE_ID}`);
  log('INFO', `MQTT Broker: ${MQTT_BROKER_URL}`);
  log('INFO', `MQTT Topic: payment/${STORE_ID}/incoming`);
  log('INFO', 'Waiting for SePay webhooks...');
});

// ============ GRACEFUL SHUTDOWN ============
process.on('SIGTERM', () => {
  log('WARNING', 'SIGTERM received, shutting down gracefully');
  mqttClient.end();
  process.exit(0);
});

process.on('SIGINT', () => {
  log('WARNING', 'SIGINT received, shutting down gracefully');
  mqttClient.end();
  process.exit(0);
});
