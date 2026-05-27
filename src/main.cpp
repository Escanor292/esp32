/*
 * SePay Payment Notification System - ESP32 Device
 * MQTT-based Implementation
 * 
 * Features:
 * - WiFi connection management with auto-reconnect
 * - MQTT client for receiving payment notifications
 * - OLED display for transaction info
 * - DFPlayer audio notification system
 * - Vietnamese number-to-speech conversion
 * - Duplicate transaction detection
 * - LED status indicator
 * - Button to replay last transaction
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HardwareSerial.h>
#include <DFRobotDFPlayerMini.h>
#include <ArduinoJson.h>
#include <WiFiManager.h>
#include <qrcode.h>

// ============ CONFIGURATION ============
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1

// WiFiManager & WebServer
WiFiManager wm;
WebServer server(80);

// MQTT Configuration
const char* MQTT_BROKER = "broker.hivemq.com";
const int MQTT_PORT = 1883;
const char* STORE_ID = "store_001";
const char* MQTT_TOPIC = "payment/store_001/incoming";
const char* MQTT_CLIENT_ID = "esp32_payment_device";
const char* STORE_QR_DATA = "https://sepay.vn/vi/pay/store_001"; // Static QR code URL for Store

// Pin Configuration
#define DFPLAYER_RX 16
#define DFPLAYER_TX 17
#define OLED_SDA 21
#define OLED_SCL 22
#define LED_PIN 2

// ============ DEVICE STATE ============
enum DeviceState {
  STATE_STARTUP,
  STATE_CONNECTING_WIFI,
  STATE_CONNECTING_MQTT,
  STATE_IDLE,
  STATE_PROCESSING_PAYMENT,
  STATE_ERROR
};

// ============ GLOBAL OBJECTS ============
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
HardwareSerial dfPlayerSerial(2);
DFRobotDFPlayerMini dfPlayer;
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// ============ GLOBAL VARIABLES ============
DeviceState currentState = STATE_STARTUP;
DeviceState previousState = STATE_STARTUP;

// Transaction tracking
struct Transaction {
  int id;
  long amount;
  String date;
  String gateway;
  String content;
};

Transaction lastTransaction;
int lastTransactionIds[10] = {0};  // Store last 10 transaction IDs for duplicate detection
int transactionIdIndex = 0;

// Timing
unsigned long lastHeartbeat = 0;
unsigned long paymentProcessingTime = 0;
bool isMqttConnected = false;
bool isPlayingAudio = false;

// ============ FUNCTION DECLARATIONS ============
void initDisplay();
void initAudio();
void initWiFi();
void initMQTT();
void updateState();
void handleStateTransition();
void displayTransactionInfo(const Transaction& txn);
void displayStatus(const char* status);
void displayError(const char* error);
void displayConnecting(const char* message);
void displayIdleScreen();
void displayQRCode(const char* qrData, int xOffset = 64, int yOffset = 3, int scale = 2);
void configModeCallback(WiFiManager *myWiFiManager);
void mqttCallback(char* topic, byte* payload, unsigned int length);
void handlePaymentNotification(const char* json);
void playTransactionAudio(long amount);
void generateVietnameseAudio(long amount, int* audioSequence, int& sequenceLength);
void updateLEDStatus();
bool isDuplicateTransaction(int transactionId);
void recordTransactionId(int transactionId);
void logTransaction(const Transaction& txn);

// ============ SETUP ============
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n=== SePay Payment Notification System - ESP32 ===");
  Serial.println("Initializing...");
  
  // Initialize pins
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  // Initialize I2C for OLED
  Wire.begin(OLED_SDA, OLED_SCL);
  
  // Initialize display
  initDisplay();
  displayStatus("Initializing...");
  
  // Initialize audio
  initAudio();
  
  // Initialize WiFi
  initWiFi();
  
  // Initialize MQTT
  initMQTT();
  
  // Initialize transaction tracking
  memset(lastTransactionIds, 0, sizeof(lastTransactionIds));
  
  // Initialize WebServer with local virtual reset
  server.on("/reset", []() {
    server.send(200, "text/html; charset=utf-8", 
      "<html><head><meta charset='UTF-8'></head><body style='font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:white;'>"
      "<h3>Đang xóa cấu hình WiFi và khởi động lại thiết bị...</h3>"
      "<p>Vui lòng kết nối vào mạng WiFi do ESP32 phát ra để cấu hình lại.</p>"
      "</body></html>");
    Serial.println("🔘 Virtual Button clicked - Resetting WiFi settings...");
    delay(1500);
    wm.resetSettings();
    ESP.restart();
  });
  
  server.on("/", []() {
    String html = R"=====(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cấu hình Thiết bị SePay ESP32</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Outfit', sans-serif;
      background: #0f172a;
      color: #f1f5f9;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(10px);
      padding: 30px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 20px;
      color: #38bdf8;
    }
    .status {
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
      padding: 8px 12px;
      background: rgba(15, 23, 42, 0.5);
      border-radius: 8px;
      font-size: 14px;
    }
    .status span:first-child {
      color: #94a3b8;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 12px;
      margin-top: 25px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.3s;
    }
    .btn:hover {
      background: #dc2626;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Thiết Bị Đọc Chuyển Khoản</h1>
    <div class="status">
      <span>Trạng thái:</span>
      <span style="color: #4caf50;">Hoạt động (Online)</span>
    </div>
    <div class="status">
      <span>Thiết bị ID:</span>
      <span>store_001</span>
    </div>
    <div class="status">
      <span>Kết nối WiFi:</span>
      <span style="color: #4caf50;">Đã kết nối</span>
    </div>
    <button class="btn" onclick="if(confirm('Bạn có chắc chắn muốn xóa cấu hình WiFi cũ và khởi động lại thiết bị không?')) { location.href='/reset'; }">
      Xóa Cấu Hùi WiFi
    </button>
  </div>
</body>
</html>
)=====";
    server.send(200, "text/html", html);
  });
  server.begin();
  Serial.println("✅ Local Test WebServer running on port 80");
  
  Serial.println("Setup complete!");
}

// ============ MAIN LOOP ============
void loop() {
  server.handleClient();
  
  // Handle WiFi reconnection
  if (WiFi.status() != WL_CONNECTED) {
    if (currentState != STATE_ERROR) {
      currentState = STATE_CONNECTING_WIFI;
    }
  } else {
    // Handle MQTT connection
    if (!mqttClient.connected()) {
      if (currentState != STATE_ERROR) {
        currentState = STATE_CONNECTING_MQTT;
      }
    } else {
      mqttClient.loop();
      if (currentState == STATE_CONNECTING_MQTT) {
        currentState = STATE_IDLE;
      }
    }
  }
  
  // Update state
  updateState();
  
  // Handle state transitions
  handleStateTransition();
  
  // Update LED status
  updateLEDStatus();
  
  // Send heartbeat every 30 seconds (reduced frequency for stability)
  if (millis() - lastHeartbeat > 30000) {
    lastHeartbeat = millis();
    Serial.println("Heartbeat - System online");
    
    // Send heartbeat via MQTT
    if (mqttClient.connected()) {
      StaticJsonDocument<128> doc;
      doc["device_id"] = STORE_ID;
      doc["status"] = "online";
      char buffer[128];
      serializeJson(doc, buffer);
      mqttClient.publish("payment/store_001/heartbeat", buffer);
      Serial.println("✅ Heartbeat sent to MQTT");
    }
    
    // Send heartbeat via HTTP to Vercel
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.setTimeout(15000); // 15 second timeout
      http.setReuse(false);   // Don't reuse connection (prevents SSL EOF errors)
      
      http.begin("https://esp32-ruddy.vercel.app/api/v1/devices/heartbeat");
      http.addHeader("Content-Type", "application/json");
      
      StaticJsonDocument<128> doc;
      doc["device_id"] = STORE_ID;
      doc["status"] = "online";
      
      String payload;
      serializeJson(doc, payload);
      
      int httpCode = http.POST(payload);
      if (httpCode > 0) {
        Serial.printf("✅ HTTP Heartbeat sent: %d\n", httpCode);
      } else {
        Serial.printf("❌ HTTP Heartbeat failed: %s\n", http.errorToString(httpCode).c_str());
      }
      http.end();
    }
  }
  
  delay(100);
}

// ============ INITIALIZATION FUNCTIONS ============

void initDisplay() {
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 allocation failed");
    while (1);
  }
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("SePay Payment");
  display.println("System");
  display.println("Initializing...");
  display.display();
  
  Serial.println("✅ Display initialized");
}

void initAudio() {
  dfPlayerSerial.begin(9600, SERIAL_8N1, DFPLAYER_RX, DFPLAYER_TX);
  delay(500);
  
  if (!dfPlayer.begin(dfPlayerSerial)) {
    Serial.println("❌ DFPlayer initialization failed!");
    displayError("Audio Init Failed");
    while (1);
  }
  
  dfPlayer.setTimeOut(500);
  dfPlayer.volume(20);
  dfPlayer.EQ(DFPLAYER_EQ_NORMAL);
  
  Serial.println("✅ Audio initialized");
}

void configModeCallback(WiFiManager *myWiFiManager) {
  Serial.println("Chế độ cấu hình WiFi!");
  Serial.println(WiFi.softAPIP());
  Serial.println(myWiFiManager->getConfigPortalSSID());
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("CAU HINH WIFI");
  display.drawFastHLine(0, 10, 128, SSD1306_WHITE);
  
  display.setCursor(0, 16);
  display.println("Ket noi vao Wifi AP:");
  display.setCursor(0, 28);
  display.setTextColor(SSD1306_WHITE);
  display.println(myWiFiManager->getConfigPortalSSID());
  
  display.setCursor(0, 44);
  display.println("Truy cap IP: 192.168.4.1");
  display.setCursor(0, 54);
  display.println("De chon mang & nhap MK");
  display.display();
}

void initWiFi() {
  currentState = STATE_CONNECTING_WIFI;
  displayConnecting("Connecting WiFi...");
  
  WiFi.mode(WIFI_STA);
  wm.setAPCallback(configModeCallback);
  wm.setConfigPortalTimeout(180); // Tự thoát sau 3 phút nếu không cấu hình
  
  Serial.println("Connecting WiFi via WiFiManager...");
  
  // Tự động kết nối, nếu chưa lưu thông tin sẽ phát WiFi: "ESP32_Payment_AP"
  if(!wm.autoConnect("ESP32_Payment_AP")) {
    Serial.println("❌ WiFi connection failed!");
    displayError("WiFi Failed");
    currentState = STATE_ERROR;
    delay(3000);
    ESP.restart();
  }
  
  Serial.println("\n✅ WiFi connected!");
  Serial.print("   SSID: ");
  Serial.println(WiFi.SSID());
  Serial.print("   IP: ");
  Serial.println(WiFi.localIP());
  displayStatus("WiFi OK");
  delay(1000);
}

void initMQTT() {
  currentState = STATE_CONNECTING_MQTT;
  displayConnecting("Connecting MQTT...");
  
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  
  int attempts = 0;
  while (!mqttClient.connected() && attempts < 10) {
    Serial.print("Attempting MQTT connection...");
    
    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println("✅ MQTT connected!");
      
      // Subscribe to payment notification topic
      if (mqttClient.subscribe(MQTT_TOPIC)) {
        Serial.print("✅ Subscribed to: ");
        Serial.println(MQTT_TOPIC);
      }
      
      // Subscribe to new order topic (for QR display)
      String newOrderTopic = String("payment/") + STORE_ID + "/new_order";
      if (mqttClient.subscribe(newOrderTopic.c_str())) {
        Serial.print("✅ Subscribed to: ");
        Serial.println(newOrderTopic);
      }
      
      isMqttConnected = true;
      currentState = STATE_IDLE;
      displayIdleScreen();
      return;
    } else {
      Serial.print("❌ Failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" retrying...");
      delay(1000);
      attempts++;
    }
  }
  
  if (!mqttClient.connected()) {
    displayError("MQTT Failed");
    currentState = STATE_ERROR;
  }
}

// ============ STATE MANAGEMENT ============

void updateState() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    if (currentState != STATE_CONNECTING_WIFI && currentState != STATE_ERROR) {
      currentState = STATE_CONNECTING_WIFI;
    }
    return;
  }
  
  // Check MQTT connection
  if (!mqttClient.connected()) {
    if (currentState != STATE_CONNECTING_MQTT && currentState != STATE_ERROR) {
      currentState = STATE_CONNECTING_MQTT;
    }
  }
}

void handleStateTransition() {
  if (currentState == previousState) {
    return;
  }
  
  previousState = currentState;
  
  switch (currentState) {
    case STATE_STARTUP:
      displayStatus("Starting up...");
      break;
      
    case STATE_CONNECTING_WIFI:
      displayConnecting("Connecting WiFi...");
      break;
      
    case STATE_CONNECTING_MQTT:
      displayConnecting("Connecting MQTT...");
      break;
      
    case STATE_IDLE:
      displayIdleScreen();
      break;
      
    case STATE_PROCESSING_PAYMENT:
      displayTransactionInfo(lastTransaction);
      paymentProcessingTime = millis();
      break;
      
    case STATE_ERROR:
      displayError("System Error");
      break;
  }
}

// ============ DISPLAY FUNCTIONS ============

void displayTransactionInfo(const Transaction& txn) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  
  // Title
  display.setCursor(0, 0);
  display.println("PAYMENT RECEIVED");
  
  // Amount (large)
  display.setTextSize(2);
  display.setCursor(0, 12);
  
  // Format amount with thousand separators
  String amountStr = String(txn.amount);
  if (amountStr.length() > 3) {
    String formatted = "";
    int count = 0;
    for (int i = amountStr.length() - 1; i >= 0; i--) {
      if (count > 0 && count % 3 == 0) {
        formatted = "," + formatted;
      }
      formatted = amountStr[i] + formatted;
      count++;
    }
    display.println(formatted);
  } else {
    display.println(amountStr);
  }
  
  // VND label
  display.setTextSize(1);
  display.setCursor(0, 32);
  display.println("VND");
  
  // Transaction ID
  display.setCursor(0, 42);
  display.print("ID: ");
  display.println(txn.id);
  
  // Gateway
  display.setCursor(0, 50);
  display.print("Bank: ");
  display.println(txn.gateway);
  
  // Time
  display.setCursor(0, 58);
  display.println(txn.date);
  
  display.display();
}

void displayStatus(const char* status) {
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 20);
  display.println(status);
  display.display();
  Serial.println("Status: " + String(status));
}

void displayQRCode(const char* qrData, int xOffset, int yOffset, int scale) {
  QRCode qrcode;
  uint8_t qrcodeData[qrcode_getBufferSize(3)];
  qrcode_initText(&qrcode, qrcodeData, 3, ECC_LOW, qrData);
  
  for (uint8_t y = 0; y < qrcode.size; y++) {
    for (uint8_t x = 0; x < qrcode.size; x++) {
      if (qrcode_getModule(&qrcode, x, y)) {
        display.fillRect(xOffset + x * scale, yOffset + y * scale, scale, scale, SSD1306_WHITE);
      } else {
        display.fillRect(xOffset + x * scale, yOffset + y * scale, scale, scale, SSD1306_BLACK);
      }
    }
  }
}

void displayIdleScreen() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  
  // Left side: Text descriptions
  display.setTextSize(1);
  display.setCursor(0, 4);
  display.println("SEPAY");
  display.setCursor(0, 14);
  display.println("ONLINE");
  
  display.drawFastHLine(0, 25, 58, SSD1306_WHITE);
  
  display.setCursor(0, 31);
  display.println("QUET MA");
  display.setCursor(0, 41);
  display.println("THANH");
  display.setCursor(0, 51);
  display.println("TOAN");
  
  // Right side: QR Code
  displayQRCode(STORE_QR_DATA, 64, 3, 2);
  
  display.display();
  Serial.println("Idle screen with QR Code rendered successfully");
}

void displayConnecting(const char* message) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 20);
  display.println(message);
  display.setCursor(0, 35);
  display.println("Please wait...");
  display.display();
  Serial.println("Connecting: " + String(message));
}

void displayError(const char* error) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("ERROR");
  display.setCursor(0, 20);
  display.println(error);
  display.setCursor(0, 40);
  display.println("Check WiFi/MQTT");
  display.display();
  Serial.println("Error: " + String(error));
}

// ============ AUDIO FUNCTIONS ============

void playTransactionAudio(long amount) {
  if (isPlayingAudio) {
    Serial.println("⚠️  Audio already playing, skipping");
    return;
  }
  
  isPlayingAudio = true;
  
  // Generate Vietnamese audio sequence
  int audioSequence[50];
  int sequenceLength = 0;
  
  generateVietnameseAudio(amount, audioSequence, sequenceLength);
  
  // Play opening announcement
  Serial.println("🔊 Playing: Đã nhận được");
  dfPlayer.playMp3Folder(1003);  // "Đã nhận được"
  delay(1500);
  
  // Play amount
  for (int i = 0; i < sequenceLength; i++) {
    Serial.print("🔊 Playing track: ");
    Serial.println(audioSequence[i]);
    dfPlayer.playMp3Folder(audioSequence[i]);
    delay(800);  // Wait between tracks
  }
  
  // Play closing
  Serial.println("🔊 Playing: Đồng");
  dfPlayer.playMp3Folder(1002);  // "Đồng"
  delay(1000);
  
  isPlayingAudio = false;
}

void generateVietnameseAudio(long amount, int* audioSequence, int& sequenceLength) {
  sequenceLength = 0;
  
  if (amount == 0) {
    audioSequence[sequenceLength++] = 1000;  // "không"
    return;
  }
  
  // Process millions
  long millions = amount / 1000000;
  if (millions > 0) {
    // Add number for millions
    if (millions < 10) {
      audioSequence[sequenceLength++] = 1000 + millions;  // 1001-1009
    } else if (millions < 20) {
      audioSequence[sequenceLength++] = 1000;  // "mười"
      audioSequence[sequenceLength++] = 1000 + (millions - 10);
    } else {
      // For 20-99 millions
      int tens = millions / 10;
      int ones = millions % 10;
      audioSequence[sequenceLength++] = 1000 + tens;  // "hai mươi", "ba mươi", etc.
      if (ones > 0) {
        audioSequence[sequenceLength++] = 1000 + ones;
      }
    }
    audioSequence[sequenceLength++] = 1001;  // "triệu"
    amount = amount % 1000000;
  }
  
  // Process thousands
  long thousands = amount / 1000;
  if (thousands > 0) {
    if (thousands < 10) {
      audioSequence[sequenceLength++] = 1000 + thousands;
    } else if (thousands < 20) {
      audioSequence[sequenceLength++] = 1000;  // "mười"
      audioSequence[sequenceLength++] = 1000 + (thousands - 10);
    } else {
      int tens = thousands / 10;
      int ones = thousands % 10;
      audioSequence[sequenceLength++] = 1000 + tens;
      if (ones > 0) {
        audioSequence[sequenceLength++] = 1000 + ones;
      }
    }
    audioSequence[sequenceLength++] = 1000;  // "nghìn"
    amount = amount % 1000;
  }
  
  // Process hundreds
  long hundreds = amount / 100;
  if (hundreds > 0) {
    audioSequence[sequenceLength++] = 100 + hundreds;  // "một trăm", "hai trăm", etc.
    amount = amount % 100;
  }
  
  // Process tens and ones
  if (amount > 0) {
    if (amount < 10) {
      if (amount > 0) {
        audioSequence[sequenceLength++] = amount;  // 1-9
      }
    } else if (amount < 20) {
      audioSequence[sequenceLength++] = 10;  // "mười"
      if (amount > 10) {
        audioSequence[sequenceLength++] = amount - 10;
      }
    } else {
      int tens = amount / 10;
      int ones = amount % 10;
      audioSequence[sequenceLength++] = 20 + (tens - 2) * 10;  // "hai mươi", "ba mươi", etc.
      if (ones > 0) {
        audioSequence[sequenceLength++] = ones;
      }
    }
  }
}

// ============ MQTT FUNCTIONS ============

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("📨 MQTT Message received on topic: ");
  Serial.println(topic);
  
  // Convert payload to string
  char message[length + 1];
  memcpy(message, payload, length);
  message[length] = '\0';
  
  Serial.print("   Payload: ");
  Serial.println(message);
  
  // Parse JSON
  StaticJsonDocument<500> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    Serial.print("❌ JSON parse error: ");
    Serial.println(error.c_str());
    return;
  }
  
  // Check topic type
  String topicStr = String(topic);
  
  if (topicStr.endsWith("/new_order")) {
    // Handle new order - Display QR code
    Serial.println("📦 New order received - Displaying QR code");
    
    long amount = doc["transferAmount"] | 0;
    String txnCode = doc["referenceCode"] | "";
    
    // Display order info with QR code
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    
    // Title
    display.setCursor(0, 0);
    display.println("DON HANG MOI");
    display.drawFastHLine(0, 10, 128, SSD1306_WHITE);
    
    // Amount
    display.setCursor(0, 15);
    display.print("So tien: ");
    display.print(amount);
    display.println("d");
    
    // Transaction code
    display.setCursor(0, 25);
    display.print("Ma: ");
    display.println(txnCode);
    
    // QR Code (right side)
    String qrData = "https://sepay.vn/qr/" + txnCode;
    displayQRCode(qrData.c_str(), 70, 35, 1);
    
    display.display();
    
    Serial.println("✅ QR Code displayed on OLED");
    
    // Auto return to idle after 30 seconds
    delay(30000);
    displayIdleScreen();
    
  } else if (topicStr.endsWith("/incoming")) {
    // Handle payment notification
    handlePaymentNotification(message);
  }
}

void handlePaymentNotification(const char* json) {
  StaticJsonDocument<500> doc;
  DeserializationError error = deserializeJson(doc, json);
  
  if (error) {
    Serial.print("❌ JSON parse error: ");
    Serial.println(error.c_str());
    return;
  }
  
  // Extract transaction data
  int transactionId = doc["id"] | 0;
  long amount = doc["transferAmount"] | 0;
  String gateway = doc["gateway"] | "Unknown";
  String date = doc["transactionDate"] | "";
  String content = doc["content"] | "";
  
  // Check for duplicate
  if (isDuplicateTransaction(transactionId)) {
    Serial.println("⚠️  Duplicate transaction detected, ignoring");
    return;
  }
  
  // Record transaction ID
  recordTransactionId(transactionId);
  
  // Store transaction
  lastTransaction.id = transactionId;
  lastTransaction.amount = amount;
  lastTransaction.gateway = gateway;
  lastTransaction.date = date;
  lastTransaction.content = content;
  
  // Log transaction
  logTransaction(lastTransaction);
  
  // Update state
  currentState = STATE_PROCESSING_PAYMENT;
  
  // Play audio notification
  playTransactionAudio(amount);
  
  // Return to idle after 5 seconds
  delay(5000);
  currentState = STATE_IDLE;
}

// ============ TRANSACTION TRACKING ============

bool isDuplicateTransaction(int transactionId) {
  for (int i = 0; i < 10; i++) {
    if (lastTransactionIds[i] == transactionId) {
      return true;
    }
  }
  return false;
}

void recordTransactionId(int transactionId) {
  lastTransactionIds[transactionIdIndex] = transactionId;
  transactionIdIndex = (transactionIdIndex + 1) % 10;
}

void logTransaction(const Transaction& txn) {
  Serial.println("\n📊 ===== TRANSACTION LOGGED =====");
  Serial.print("   ID: ");
  Serial.println(txn.id);
  Serial.print("   Amount: ");
  Serial.print(txn.amount);
  Serial.println(" VND");
  Serial.print("   Bank: ");
  Serial.println(txn.gateway);
  Serial.print("   Date: ");
  Serial.println(txn.date);
  Serial.print("   Content: ");
  Serial.println(txn.content);
  Serial.println("================================\n");
}

// ============ LED & BUTTON FUNCTIONS ============

void updateLEDStatus() {
  static unsigned long lastBlink = 0;
  static bool ledState = false;
  
  if (WiFi.status() != WL_CONNECTED || !mqttClient.connected()) {
    // Blinking: Connecting
    if (millis() - lastBlink > 500) {
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState ? HIGH : LOW);
      lastBlink = millis();
    }
  } else {
    // Solid: Connected
    digitalWrite(LED_PIN, HIGH);
  }
}

// Physical button logic removed as requested. Reset is now handled via the local web portal.