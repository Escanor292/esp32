/*
 * SePay Payment Notification System - ESP32 Device
 * MQTT-based Implementation
 *
 * MQTT Broker changed to EMQX:
 * broker.emqx.io:1883
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

WiFiManager wm;
WebServer server(80);

// ============ MQTT CONFIGURATION ============
const char* MQTT_BROKER = "broker.emqx.io";
const int MQTT_PORT = 1883;

const char* STORE_ID = "store_001";
const char* MQTT_CLIENT_ID = "esp32_payment_device";

const char* MQTT_TOPIC_INCOMING = "payment/store_001/incoming";
const char* MQTT_TOPIC_NEW_ORDER = "payment/store_001/new_order";
const char* MQTT_TOPIC_HEARTBEAT = "payment/store_001/heartbeat";

// Backend heartbeat
const char* HEARTBEAT_URL = "https://esp32-ruddy.vercel.app/api/v1/devices/heartbeat";

// ============ BANK CONFIGURATION ============
const char* BANK_ACCOUNT = "0932299701";
const char* BANK_CODE = "MBBank";
const char* BANK_NAME = "NGUYEN QUACH PHU TAI";

// ============ PIN CONFIGURATION ============
#define DFPLAYER_RX 16
#define DFPLAYER_TX 17
#define OLED_SDA 21
#define OLED_SCL 22
#define LED_PIN 2

// QR config
#define QR_VERSION 10
#define QR_SCALE 2
#define QR_X 66
#define QR_Y 3

// ============ DEVICE STATE ============
enum DeviceState {
  STATE_STARTUP,
  STATE_CONNECTING_WIFI,
  STATE_CONNECTING_MQTT,
  STATE_IDLE,
  STATE_PROCESSING_PAYMENT,
  STATE_SHOWING_QR,
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

struct Transaction {
  int id;
  long amount;
  String date;
  String gateway;
  String content;
};

Transaction lastTransaction;

int lastTransactionIds[10] = {0};
int transactionIdIndex = 0;

unsigned long lastHeartbeat = 0;
unsigned long lastMqttReconnectAttempt = 0;
unsigned long qrDisplayStartTime = 0;

bool isPlayingAudio = false;

// Idle screen animation variables
bool isIdleScreen = true;
unsigned long lastIdleAnim = 0;
int wifiPulseStep = 0;
int rocketX = 0;

// ============ FUNCTION DECLARATIONS ============
void initDisplay();
void initAudio();
void initWiFi();
void initMQTT();
bool reconnectMQTT();
void subscribeTopics();

void updateState();
void handleStateTransition();
void updateLEDStatus();

void displayStatus(const char* status);
void displayError(const char* error);
void displayConnecting(const char* message);
void displayIdleScreen();
void displayTransactionInfo(const Transaction& txn);
void displayQRCode(const char* qrData, int xOffset = QR_X, int yOffset = QR_Y, int scale = QR_SCALE);
void displayQRCodeAt(const char* text, int startX, int startY, int scale);
void displayNewOrderQR(long amount, const String& txnCode, const String& qrData = "");
void updateIdleAnimation();
void drawIdleFrame();

void configModeCallback(WiFiManager *myWiFiManager);

void mqttCallback(char* topic, byte* payload, unsigned int length);
void handleNewOrder(const char* json);
void handlePaymentNotification(const char* json);

void playTransactionAudio(long amount);
void generateVietnameseAudio(long amount, int* audioSequence, int& sequenceLength);

bool isDuplicateTransaction(int transactionId);
void recordTransactionId(int transactionId);
void logTransaction(const Transaction& txn);

String formatAmount(long amount);
String shortenCode(const String& code, int maxLen);
void sendHeartbeat();

// ============ SETUP ============
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println();
  Serial.println("=== SePay Payment Notification System - ESP32 ===");
  Serial.println("Initializing...");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Wire.begin(OLED_SDA, OLED_SCL);

  initDisplay();
  displayStatus("Initializing...");

  initAudio();
  initWiFi();
  initMQTT();

  memset(lastTransactionIds, 0, sizeof(lastTransactionIds));

  server.on("/reset", []() {
    server.send(200, "text/html; charset=utf-8",
      "<html><head><meta charset='UTF-8'></head>"
      "<body style='font-family:sans-serif;text-align:center;padding:50px;background:#0f172a;color:white;'>"
      "<h3>Đang xóa cấu hình WiFi và khởi động lại thiết bị...</h3>"
      "<p>Vui lòng kết nối vào mạng WiFi do ESP32 phát ra để cấu hình lại.</p>"
      "</body></html>"
    );

    Serial.println("Reset WiFi requested");
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
  <title>ESP32 Payment Device</title>
  <style>
    body {
      font-family: sans-serif;
      background: #0f172a;
      color: #f1f5f9;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }
    .card {
      background: #1e293b;
      padding: 30px;
      border-radius: 16px;
      max-width: 420px;
      width: 90%;
      text-align: center;
    }
    h1 { color: #38bdf8; }
    .status {
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
      padding: 10px;
      background: #0f172a;
      border-radius: 8px;
    }
    .green { color: #4ade80; }
    .btn {
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
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Thiết Bị Đọc Chuyển Khoản</h1>
    <div class="status">
      <span>Trạng thái:</span>
      <span class="green">Online</span>
    </div>
    <div class="status">
      <span>Thiết bị ID:</span>
      <span>store_001</span>
    </div>
    <div class="status">
      <span>WiFi:</span>
      <span class="green">Đã kết nối</span>
    </div>
    <button class="btn" onclick="if(confirm('Xóa cấu hình WiFi và khởi động lại?')) location.href='/reset';">
      Xóa cấu hình WiFi
    </button>
  </div>
</body>
</html>
)=====";

    server.send(200, "text/html", html);
  });

  server.begin();
  Serial.println("Local WebServer running on port 80");
  Serial.println("Setup complete!");
}

// ============ MAIN LOOP ============
void loop() {
  server.handleClient();

  if (WiFi.status() != WL_CONNECTED) {
    currentState = STATE_CONNECTING_WIFI;
  } else {
    if (!mqttClient.connected()) {
      currentState = STATE_CONNECTING_MQTT;

      unsigned long now = millis();
      if (now - lastMqttReconnectAttempt > 5000) {
        lastMqttReconnectAttempt = now;

        if (reconnectMQTT()) {
          lastMqttReconnectAttempt = 0;
          currentState = STATE_IDLE;
          displayIdleScreen();
        }
      }
    } else {
      mqttClient.loop();

      if (currentState == STATE_CONNECTING_MQTT) {
        currentState = STATE_IDLE;
      }
    }
  }

  if (currentState == STATE_SHOWING_QR) {
    if (millis() - qrDisplayStartTime > 30000) {
      currentState = STATE_IDLE;
      displayIdleScreen();
    }
  }

  updateIdleAnimation();

  updateState();
  handleStateTransition();
  updateLEDStatus();

  if (millis() - lastHeartbeat > 30000) {
    lastHeartbeat = millis();
    sendHeartbeat();
  }

  delay(50);
}

// ============ INITIALIZATION ============
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

  Serial.println("Display initialized");
}

void initAudio() {
  dfPlayerSerial.begin(9600, SERIAL_8N1, DFPLAYER_RX, DFPLAYER_TX);
  delay(500);

  if (!dfPlayer.begin(dfPlayerSerial)) {
    Serial.println("DFPlayer initialization failed!");
    displayError("Audio Init Failed");
    while (1);
  }

  dfPlayer.setTimeOut(500);
  dfPlayer.volume(20);
  dfPlayer.EQ(DFPLAYER_EQ_NORMAL);

  Serial.println("Audio initialized");
}

void configModeCallback(WiFiManager *myWiFiManager) {
  Serial.println("WiFi config mode");
  Serial.println(WiFi.softAPIP());
  Serial.println(myWiFiManager->getConfigPortalSSID());

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.println("CAU HINH WIFI");
  display.drawFastHLine(0, 10, 128, SSD1306_WHITE);

  display.setCursor(0, 16);
  display.println("Ket noi WiFi AP:");

  display.setCursor(0, 28);
  display.println(myWiFiManager->getConfigPortalSSID());

  display.setCursor(0, 44);
  display.println("IP: 192.168.4.1");

  display.setCursor(0, 54);
  display.println("Chon WiFi & nhap MK");

  display.display();
}

void initWiFi() {
  currentState = STATE_CONNECTING_WIFI;
  displayConnecting("Connecting WiFi...");

  WiFi.mode(WIFI_STA);
  wm.setAPCallback(configModeCallback);
  wm.setConfigPortalTimeout(180);

  Serial.println("Connecting WiFi via WiFiManager...");

  if (!wm.autoConnect("ESP32_Payment_AP")) {
    Serial.println("WiFi connection failed!");
    displayError("WiFi Failed");
    currentState = STATE_ERROR;
    delay(3000);
    ESP.restart();
  }

  Serial.println("WiFi connected!");
  Serial.print("SSID: ");
  Serial.println(WiFi.SSID());
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  displayStatus("WiFi OK");
  delay(1000);
}

void initMQTT() {
  currentState = STATE_CONNECTING_MQTT;
  displayConnecting("Connecting MQTT...");

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(1024);

  if (reconnectMQTT()) {
    currentState = STATE_IDLE;
    displayIdleScreen();
  } else {
    currentState = STATE_ERROR;
    displayError("MQTT Failed");
  }
}

bool reconnectMQTT() {
  if (mqttClient.connected()) {
    return true;
  }

  Serial.print("Attempting MQTT connection to ");
  Serial.print(MQTT_BROKER);
  Serial.print(":");
  Serial.println(MQTT_PORT);

  String clientId = String(MQTT_CLIENT_ID) + "_" + String((uint32_t)ESP.getEfuseMac(), HEX);

  if (mqttClient.connect(clientId.c_str())) {
    Serial.println("MQTT connected!");
    Serial.print("Client ID: ");
    Serial.println(clientId);

    subscribeTopics();
    return true;
  }

  Serial.print("MQTT failed, rc=");
  Serial.println(mqttClient.state());

  return false;
}

void subscribeTopics() {
  if (mqttClient.subscribe(MQTT_TOPIC_INCOMING)) {
    Serial.print("Subscribed to: ");
    Serial.println(MQTT_TOPIC_INCOMING);
  } else {
    Serial.print("Subscribe failed: ");
    Serial.println(MQTT_TOPIC_INCOMING);
  }

  if (mqttClient.subscribe(MQTT_TOPIC_NEW_ORDER)) {
    Serial.print("Subscribed to: ");
    Serial.println(MQTT_TOPIC_NEW_ORDER);
  } else {
    Serial.print("Subscribe failed: ");
    Serial.println(MQTT_TOPIC_NEW_ORDER);
  }

  // Subscribe thêm wildcard để debug.
  if (mqttClient.subscribe("payment/store_001/#")) {
    Serial.println("Subscribed to wildcard: payment/store_001/#");
  } else {
    Serial.println("Subscribe wildcard failed");
  }
}

// ============ STATE MANAGEMENT ============
void updateState() {
  if (WiFi.status() != WL_CONNECTED) {
    if (currentState != STATE_CONNECTING_WIFI && currentState != STATE_ERROR) {
      currentState = STATE_CONNECTING_WIFI;
    }
    return;
  }

  if (!mqttClient.connected()) {
    if (currentState != STATE_CONNECTING_MQTT && currentState != STATE_ERROR) {
      currentState = STATE_CONNECTING_MQTT;
    }
    return;
  }
}

void handleStateTransition() {
  if (currentState == previousState) {
    return;
  }

  previousState = currentState;

  switch (currentState) {
    case STATE_STARTUP:
      displayStatus("Starting...");
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
      break;

    case STATE_SHOWING_QR:
      break;

    case STATE_ERROR:
      displayError("System Error");
      break;
  }
}

// ============ DISPLAY ============
void displayStatus(const char* status) {
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 20);
  display.println(status);
  display.display();

  Serial.print("Status: ");
  Serial.println(status);
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

  Serial.print("Error: ");
  Serial.println(error);
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

  Serial.print("Connecting: ");
  Serial.println(message);
}

void displayIdleScreen() {
  isIdleScreen = true;
  wifiPulseStep = 0;
  rocketX = 0;
  drawIdleFrame();
}

void updateIdleAnimation() {
  if (!isIdleScreen) return;
  if (millis() - lastIdleAnim < 400) return;
  lastIdleAnim = millis();

  wifiPulseStep++;
  if (wifiPulseStep > 3) wifiPulseStep = 0;

  rocketX += 6;
  if (rocketX > 110) rocketX = 0;

  drawIdleFrame();
}

void drawIdleFrame() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // GROUP title
  display.setTextSize(2);
  display.setCursor(34, 0);
  display.println("GROUP");

  // Connection status
  display.setTextSize(1);
  bool wifiOk = (WiFi.status() == WL_CONNECTED);
  bool mqttOk = mqttClient.connected();

  display.setCursor(0, 20);
  display.print("WIFI:");
  if (wifiOk) {
    display.print("OK");
  } else {
    display.print("ERR");
  }

  display.setCursor(64, 20);
  display.print("MQTT:");
  if (mqttOk) {
    display.print("OK");
  } else {
    display.print("ERR");
  }

  // WiFi pulse animation
  display.setCursor(0, 32);
  display.print("WiFi:");
  for (int i = 0; i <= wifiPulseStep; i++) {
    display.print(")");
  }

  // Rocket animation
  display.setCursor(rocketX, 48);
  display.print("^");

  display.display();
}

void displayTransactionInfo(const Transaction& txn) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.println("PAYMENT RECEIVED");

  display.setTextSize(2);
  display.setCursor(0, 12);
  display.println(formatAmount(txn.amount));

  display.setTextSize(1);
  display.setCursor(0, 32);
  display.println("VND");

  display.setCursor(0, 42);
  display.print("ID: ");
  display.println(txn.id);

  display.setCursor(0, 50);
  display.print("Bank: ");
  display.println(txn.gateway);

  display.setCursor(0, 58);
  display.println(txn.date);

  display.display();
}

void displayQRCode(const char* text, int xOffset, int yOffset, int scale) {
  if (!text || strlen(text) == 0) {
    Serial.println("QR text empty");
    return;
  }

  int len = strlen(text);
  Serial.print("QR Data length: ");
  Serial.println(len);

  const uint8_t qrVersion = QR_VERSION;
  uint8_t qrcodeData[qrcode_getBufferSize(qrVersion)];
  QRCode qrcode;

  qrcode_initText(&qrcode, qrcodeData, qrVersion, ECC_LOW, text);

  int qrModuleSize = qrcode.size;
  int qrPixelSize = qrModuleSize * scale;

  Serial.print("QR Buffer Size: ");
  Serial.println(qrcode_getBufferSize(qrVersion));
  Serial.print("QR Module Size: ");
  Serial.println(qrModuleSize);
  Serial.print("QR Pixel Size: ");
  Serial.println(qrPixelSize);
  Serial.print("QR X: ");
  Serial.println(xOffset);
  Serial.print("QR Y: ");
  Serial.println(yOffset);

  for (uint8_t y = 0; y < qrcode.size; y++) {
    for (uint8_t x = 0; x < qrcode.size; x++) {
      if (qrcode_getModule(&qrcode, x, y)) {
        display.fillRect(xOffset + x * scale, yOffset + y * scale, scale, scale, SSD1306_WHITE);
      }
    }
  }
}

void displayQRCodeAt(const char* text, int startX, int startY, int scale) {
  if (!text || strlen(text) == 0) {
    Serial.println("QR text empty");
    return;
  }

  int len = strlen(text);
  Serial.print("QR Data length: ");
  Serial.println(len);

  const uint8_t qrVersion = QR_VERSION;
  uint8_t qrcodeData[qrcode_getBufferSize(qrVersion)];
  QRCode qrcode;

  qrcode_initText(&qrcode, qrcodeData, qrVersion, ECC_LOW, text);

  int qrModuleSize = qrcode.size;
  int qrPixelSize = qrModuleSize * scale;

  Serial.println("QR right layout mode");
  Serial.print("QR Module Size: ");
  Serial.println(qrModuleSize);
  Serial.print("QR X: ");
  Serial.println(startX);
  Serial.print("QR Y: ");
  Serial.println(startY);
  Serial.print("QR Scale: ");
  Serial.println(scale);

  for (uint8_t y = 0; y < qrcode.size; y++) {
    for (uint8_t x = 0; x < qrcode.size; x++) {
      if (qrcode_getModule(&qrcode, x, y)) {
        display.fillRect(startX + x * scale, startY + y * scale, scale, scale, SSD1306_WHITE);
      }
    }
  }
}

void displayNewOrderQR(long amount, const String& txnCode, const String& qrData) {
  Serial.println("Displaying new order QR...");

  display.clearDisplay();

  String finalQrData;

  if (qrData.length() > 0) {
    // Use backend qrData (VietQR/EMVCo standard) - right layout
    finalQrData = qrData;
    Serial.println("QR right layout mode");
    Serial.println("QR Data source: backend qrData");
    Serial.print("QR Data length: ");
    Serial.println(finalQrData.length());

    // Initialize QR to get actual module size
    const uint8_t qrVersion = QR_VERSION;
    uint8_t qrcodeData[qrcode_getBufferSize(qrVersion)];
    QRCode qrcode;
    qrcode_initText(&qrcode, qrcodeData, qrVersion, ECC_LOW, finalQrData.c_str());

    int qrModuleSize = qrcode.size;
    int qrPixelSize = qrModuleSize * 1; // scale = 1

    Serial.print("QR Module Size: ");
    Serial.println(qrModuleSize);

    // Calculate QR position on the right side
    int qrX = 70;
    if (qrModuleSize > 58) {
      qrX = 128 - qrModuleSize;
    }
    int qrY = max(0, (64 - qrPixelSize) / 2);

    Serial.print("QR X: ");
    Serial.println(qrX);
    Serial.print("QR Y: ");
    Serial.println(qrY);

    // Draw left side text (x from 0 to 66)
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);

    display.setCursor(0, 0);
    display.println("TIEN");

    display.setCursor(0, 12);
    display.println(formatAmount(amount));

    display.setCursor(0, 30);
    display.println("MA");

    // Shorten transaction code to 6-8 chars
    String shortTxnCode = txnCode;
    if (txnCode.length() > 8) {
      shortTxnCode = txnCode.substring(txnCode.length() - 8);
    }
    display.setCursor(0, 42);
    display.println(shortTxnCode);

    // Draw QR on the right side
    for (uint8_t y = 0; y < qrcode.size; y++) {
      for (uint8_t x = 0; x < qrcode.size; x++) {
        if (qrcode_getModule(&qrcode, x, y)) {
          display.fillRect(qrX + x * 1, qrY + y * 1, 1, 1, SSD1306_WHITE);
        }
      }
    }
  } else {
    // Fallback to old format if backend didn't send qrData - full screen layout with text
    finalQrData = String(BANK_CODE) + "|" + String(BANK_ACCOUNT) + "|" + String(amount) + "|" + txnCode;
    Serial.println("QR Data source: fallback (backend qrData not available)");

    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);

    display.setCursor(0, 0);
    display.println("DON HANG");

    display.setCursor(0, 12);
    display.println("Tien:");

    display.setCursor(0, 22);
    display.print(formatAmount(amount));
    display.println("d");

    display.setCursor(0, 36);
    display.println("Ma:");

    display.setCursor(0, 46);
    display.println(shortenCode(txnCode, 9));

    display.setCursor(0, 56);
    display.println("Quet QR >");

    displayQRCode(finalQrData.c_str(), QR_X, QR_Y, QR_SCALE);
  }

  display.display();

  currentState = STATE_SHOWING_QR;
  qrDisplayStartTime = millis();

  Serial.println("QR Code displayed on OLED");
}

// ============ MQTT ============
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.println();
  Serial.println("===== MQTT RECEIVED =====");

  Serial.print("Topic: ");
  Serial.println(topic);

  String message = "";
  message.reserve(length + 1);

  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.print("Payload length: ");
  Serial.println(length);

  Serial.print("Payload: ");
  Serial.println(message);

  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (error) {
    Serial.print("JSON parse error: ");
    Serial.println(error.c_str());
    return;
  }

  Serial.println("JSON parsed successfully");

  String topicStr = String(topic);

  if (topicStr.endsWith("/new_order")) {
    Serial.println("NEW ORDER TOPIC OK");
    handleNewOrder(message.c_str());
    return;
  }

  if (topicStr.endsWith("/incoming")) {
    Serial.println("PAYMENT INCOMING TOPIC OK");
    handlePaymentNotification(message.c_str());
    return;
  }

  if (topicStr.indexOf("/new_order") >= 0) {
    Serial.println("NEW ORDER TOPIC DETECTED BY INDEX");
    handleNewOrder(message.c_str());
    return;
  }

  Serial.println("Unknown topic ignored");
}

void handleNewOrder(const char* json) {
  isIdleScreen = false;

  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, json);

  if (error) {
    Serial.print("JSON parse error in new_order: ");
    Serial.println(error.c_str());
    return;
  }

  long amount = doc["amount"] | doc["transferAmount"] | doc["total"] | 0;
  String txnCode = doc["txnCode"] | doc["referenceCode"] | doc["content"] | "";
  String qrData = doc["qrData"] | doc["vietqrPayload"] | "";

  Serial.println("----- NEW ORDER DATA -----");
  Serial.print("Amount: ");
  Serial.println(amount);
  Serial.print("TxnCode: ");
  Serial.println(txnCode);
  Serial.println("--------------------------");

  if (amount <= 0 || txnCode.length() == 0) {
    Serial.println("Missing amount or txnCode, cannot display QR");
    return;
  }

  displayNewOrderQR(amount, txnCode, qrData);
}

void handlePaymentNotification(const char* json) {
  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, json);

  if (error) {
    Serial.print("JSON parse error in incoming: ");
    Serial.println(error.c_str());
    return;
  }

  int transactionId = doc["id"] | 0;
  long amount = doc["transferAmount"] | doc["amount"] | 0;
  String gateway = doc["gateway"] | "Unknown";
  String date = doc["transactionDate"] | "";
  String content = doc["content"] | "";

  if (amount <= 0) {
    Serial.println("Invalid payment amount, ignored");
    return;
  }

  if (transactionId > 0 && isDuplicateTransaction(transactionId)) {
    Serial.println("Duplicate transaction detected, ignoring");
    return;
  }

  if (transactionId > 0) {
    recordTransactionId(transactionId);
  }

  lastTransaction.id = transactionId;
  lastTransaction.amount = amount;
  lastTransaction.gateway = gateway;
  lastTransaction.date = date;
  lastTransaction.content = content;

  logTransaction(lastTransaction);

  currentState = STATE_PROCESSING_PAYMENT;
  displayTransactionInfo(lastTransaction);

  playTransactionAudio(amount);

  delay(5000);
  currentState = STATE_IDLE;
  displayIdleScreen();
}

// ============ AUDIO ============
void playTransactionAudio(long amount) {
  if (isPlayingAudio) {
    Serial.println("Audio already playing, skipping");
    return;
  }

  isPlayingAudio = true;

  int audioSequence[50];
  int sequenceLength = 0;

  generateVietnameseAudio(amount, audioSequence, sequenceLength);

  Serial.println("Playing: Da nhan duoc");
  dfPlayer.playMp3Folder(1003);
  delay(1500);

  for (int i = 0; i < sequenceLength; i++) {
    Serial.print("Playing track: ");
    Serial.println(audioSequence[i]);

    dfPlayer.playMp3Folder(audioSequence[i]);
    delay(800);
  }

  Serial.println("Playing: Dong");
  dfPlayer.playMp3Folder(1002);
  delay(1000);

  isPlayingAudio = false;
}

void generateVietnameseAudio(long amount, int* audioSequence, int& sequenceLength) {
  sequenceLength = 0;

  if (amount == 0) {
    audioSequence[sequenceLength++] = 1;
    return;
  }

  long millions = amount / 1000000;

  if (millions > 0) {
    if (millions < 10) {
      audioSequence[sequenceLength++] = millions + 1;
    } else if (millions < 20) {
      audioSequence[sequenceLength++] = 11;

      if (millions > 10) {
        audioSequence[sequenceLength++] = (millions - 10) + 1;
      }
    } else if (millions < 100) {
      int tens = millions / 10;
      int ones = millions % 10;

      audioSequence[sequenceLength++] = 10 + tens;

      if (ones > 0) {
        audioSequence[sequenceLength++] = ones + 1;
      }
    } else {
      long hundreds = millions / 100;
      long rest = millions % 100;

      if (hundreds > 0 && hundreds <= 9) {
        audioSequence[sequenceLength++] = 100 + hundreds;
      }

      if (rest > 0) {
        if (rest < 10) {
          audioSequence[sequenceLength++] = rest + 1;
        } else if (rest < 20) {
          audioSequence[sequenceLength++] = 11;

          if (rest > 10) {
            audioSequence[sequenceLength++] = (rest - 10) + 1;
          }
        } else {
          int tens = rest / 10;
          int ones = rest % 10;

          audioSequence[sequenceLength++] = 10 + tens;

          if (ones > 0) {
            audioSequence[sequenceLength++] = ones + 1;
          }
        }
      }
    }

    audioSequence[sequenceLength++] = 1001;
    amount = amount % 1000000;
  }

  long thousands = amount / 1000;

  if (thousands > 0) {
    if (thousands < 10) {
      audioSequence[sequenceLength++] = thousands + 1;
    } else if (thousands < 20) {
      audioSequence[sequenceLength++] = 11;

      if (thousands > 10) {
        audioSequence[sequenceLength++] = (thousands - 10) + 1;
      }
    } else if (thousands < 100) {
      int tens = thousands / 10;
      int ones = thousands % 10;

      audioSequence[sequenceLength++] = 10 + tens;

      if (ones > 0) {
        audioSequence[sequenceLength++] = ones + 1;
      }
    } else {
      long hundreds = thousands / 100;
      long rest = thousands % 100;

      if (hundreds > 0 && hundreds <= 9) {
        audioSequence[sequenceLength++] = 100 + hundreds;
      }

      if (rest > 0) {
        if (rest < 10) {
          audioSequence[sequenceLength++] = rest + 1;
        } else if (rest < 20) {
          audioSequence[sequenceLength++] = 11;

          if (rest > 10) {
            audioSequence[sequenceLength++] = (rest - 10) + 1;
          }
        } else {
          int tens = rest / 10;
          int ones = rest % 10;

          audioSequence[sequenceLength++] = 10 + tens;

          if (ones > 0) {
            audioSequence[sequenceLength++] = ones + 1;
          }
        }
      }
    }

    audioSequence[sequenceLength++] = 1000;
    amount = amount % 1000;
  }

  long hundreds = amount / 100;

  if (hundreds > 0) {
    audioSequence[sequenceLength++] = 100 + hundreds;
    amount = amount % 100;
  }

  if (amount > 0) {
    if (amount < 10) {
      audioSequence[sequenceLength++] = amount + 1;
    } else if (amount < 20) {
      audioSequence[sequenceLength++] = 11;

      if (amount > 10) {
        audioSequence[sequenceLength++] = (amount - 10) + 1;
      }
    } else {
      int tens = amount / 10;
      int ones = amount % 10;

      audioSequence[sequenceLength++] = 10 + tens;

      if (ones > 0) {
        audioSequence[sequenceLength++] = ones + 1;
      }
    }
  }
}

// ============ TRANSACTION TRACKING ============
bool isDuplicateTransaction(int transactionId) {
  if (transactionId <= 0) {
    return false;
  }

  for (int i = 0; i < 10; i++) {
    if (lastTransactionIds[i] == transactionId) {
      return true;
    }
  }

  return false;
}

void recordTransactionId(int transactionId) {
  if (transactionId <= 0) {
    return;
  }

  lastTransactionIds[transactionIdIndex] = transactionId;
  transactionIdIndex = (transactionIdIndex + 1) % 10;
}

void logTransaction(const Transaction& txn) {
  Serial.println();
  Serial.println("===== TRANSACTION LOGGED =====");
  Serial.print("ID: ");
  Serial.println(txn.id);

  Serial.print("Amount: ");
  Serial.print(txn.amount);
  Serial.println(" VND");

  Serial.print("Bank: ");
  Serial.println(txn.gateway);

  Serial.print("Date: ");
  Serial.println(txn.date);

  Serial.print("Content: ");
  Serial.println(txn.content);

  Serial.println("==============================");
  Serial.println();
}

// ============ HEARTBEAT ============
void sendHeartbeat() {
  Serial.println("Heartbeat - System online");

  if (mqttClient.connected()) {
    StaticJsonDocument<128> doc;
    doc["device_id"] = STORE_ID;
    doc["status"] = "online";
    doc["millis"] = millis();

    char buffer[128];
    serializeJson(doc, buffer);

    mqttClient.publish(MQTT_TOPIC_HEARTBEAT, buffer);
    Serial.println("MQTT heartbeat sent");
  }

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.setTimeout(15000);
    http.setReuse(false);

    http.begin(HEARTBEAT_URL);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<128> doc;
    doc["device_id"] = STORE_ID;
    doc["status"] = "online";

    String payload;
    serializeJson(doc, payload);

    int httpCode = http.POST(payload);

    if (httpCode > 0) {
      Serial.printf("HTTP heartbeat sent: %d\n", httpCode);
    } else {
      Serial.printf("HTTP heartbeat failed: %s\n", http.errorToString(httpCode).c_str());
    }

    http.end();
  }
}

// ============ LED ============
void updateLEDStatus() {
  static unsigned long lastBlink = 0;
  static bool ledState = false;

  if (WiFi.status() != WL_CONNECTED || !mqttClient.connected()) {
    if (millis() - lastBlink > 500) {
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState ? HIGH : LOW);
      lastBlink = millis();
    }
  } else {
    digitalWrite(LED_PIN, HIGH);
  }
}

// ============ UTILITIES ============
String formatAmount(long amount) {
  String amountStr = String(amount);

  if (amountStr.length() <= 3) {
    return amountStr;
  }

  String formatted = "";
  int count = 0;

  for (int i = amountStr.length() - 1; i >= 0; i--) {
    if (count > 0 && count % 3 == 0) {
      formatted = "," + formatted;
    }

    formatted = amountStr[i] + formatted;
    count++;
  }

  return formatted;
}

String shortenCode(const String& code, int maxLen) {
  if (code.length() <= maxLen) {
    return code;
  }

  return code.substring(code.length() - maxLen);
}