#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HardwareSerial.h>
#include <DFRobotDFPlayerMini.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <WiFiManager.h> // Thư viện cấu hình WiFi động

// --- CẤU HÌNH PHẦN CỨNG ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define VOLT_PIN 34

// =====================================================
// CLASS ANIMATIONS
// =====================================================
class Animations {
private:
    Adafruit_SSD1306* display;
    int animationFrame;
    unsigned long lastAnimationTime;

public:
    Animations(Adafruit_SSD1306* d) : display(d), animationFrame(0), lastAnimationTime(0) {}
    void begin() { display->clearDisplay(); display->display(); }

    void showStatus(String line1, String line2, String line3) {
        display->clearDisplay();
        display->setTextSize(1);
        display->setTextColor(SSD1306_WHITE);
        display->setCursor(0, 0); display->println(line1);
        display->setCursor(0, 20); display->println(line2);
        display->setCursor(0, 40); display->println(line3);
        display->display();
    }

    void showLoadingDots(String text, int speed = 200) {
        if (millis() - lastAnimationTime > speed) {
            display->clearDisplay();
            display->setCursor((SCREEN_WIDTH - text.length() * 6) / 2, 20);
            display->println(text);
            String dots = "";
            for (int i = 0; i < (animationFrame % 4); i++) dots += ".";
            display->setCursor((SCREEN_WIDTH - dots.length() * 6) / 2, 35);
            display->println(dots);
            display->display();
            animationFrame++; lastAnimationTime = millis();
        }
    }

    void showMusicVisualizer(String status, int track, int vol, bool playing, int speed = 100) {
        if (millis() - lastAnimationTime > speed) {
            display->clearDisplay();
            display->setCursor(0, 0); display->println(status);
            display->setCursor(0, 15); display->print("Track: #"); display->println(track);
            display->setCursor(0, 30); display->print("Vol: "); display->println(vol);
            if (playing) {
                for (int i = 0; i < 6; i++) {
                    int h = random(5, 20);
                    display->fillRect(70 + i*8, 45 - h, 5, h, SSD1306_WHITE);
                }
            }
            display->display();
            lastAnimationTime = millis();
        }
    }
};

// =====================================================
// KHỞI TẠO ĐỐI TƯỢNG
// =====================================================
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Animations anim(&display);
WebServer server(80);
HardwareSerial dfSerial(2); 
DFRobotDFPlayerMini myDFPlayer;
WiFiManager wm; // Khởi tạo WiFiManager

// Biến trạng thái
int currentVolume = 15;
int currentTrack = 1;
bool isPlaying = false;
String currentStatus = "Đang khởi động";
unsigned long lastUpdate = 0;

float readVoltage() {
    int pins[] = {34, 35, 36};
    float maxV = 0;
    
    for(int p : pins) {
        long sum = 0;
        for(int i=0; i<5; i++) sum += analogRead(p);
        float v = (sum / 5.0 / 4095.0) * 3.3 * 2.0;
        if(v > maxV) maxV = v; // Lấy chân nào có điện áp cao nhất
    }
    return maxV;
}

// --- CALLBACK KHI VÀO CHẾ ĐỘ CẤU HÌNH ---
void configModeCallback (WiFiManager *myWiFiManager) {
  Serial.println("Chế độ cấu hình WiFi!");
  Serial.println(WiFi.softAPIP());
  Serial.println(myWiFiManager->getConfigPortalSSID());
  anim.showStatus("WIFI CONFIG", "Connect to:", myWiFiManager->getConfigPortalSSID());
}

// --- HANDLERS WEB ---
void handleRoot();
void handleStatus();

void setup() {
    Serial.begin(115200);
    Wire.begin(21, 22);
    
    // 1. OLED
    analogReadResolution(12); // Thiết lập 12-bit
    analogSetAttenuation(ADC_11db); // Cho phép đọc dải áp tới 3.3V
    if(display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        anim.begin();
        anim.showStatus("ESP32 SYSTEM", "Khoi dong...", "");
    }

    // 2. DFPlayer
    dfSerial.begin(9600, SERIAL_8N1, 16, 17);
    if (myDFPlayer.begin(dfSerial)) {
        myDFPlayer.volume(currentVolume);
        myDFPlayer.outputDevice(DFPLAYER_DEVICE_SD);
        currentStatus = "Sẵn sàng";
    }

    // 3. WiFiManager (Tự động kết nối hoặc phát Portal)
    wm.setAPCallback(configModeCallback);
    wm.setConfigPortalTimeout(180); // Tự thoát sau 3 phút nếu không cấu hình
    
    // Tự động kết nối, nếu không được sẽ phát WiFi: "ESP32_Config_Portal"
    if(!wm.autoConnect("ESP32_Config_Portal")) {
        Serial.println("Kết nối thất bại, đang reset...");
        delay(3000);
        ESP.restart();
    }

    Serial.println("✅ WiFi Connected: " + WiFi.localIP().toString());
    anim.showStatus("WIFI OK", "IP Address:", WiFi.localIP().toString());
    delay(2000);

    // 4. Web Server
    server.on("/", handleRoot);
    server.on("/status", handleStatus);
    server.on("/play", [](){ myDFPlayer.start(); isPlaying = true; currentStatus = "Đang phát"; server.send(200); });
    server.on("/pause", [](){ myDFPlayer.pause(); isPlaying = false; currentStatus = "Tạm dừng"; server.send(200); });
    server.on("/stop", [](){ myDFPlayer.stop(); isPlaying = false; currentStatus = "Đã dừng"; server.send(200); });
    server.on("/next", [](){ myDFPlayer.next(); currentTrack++; server.send(200); });
    server.on("/prev", [](){ myDFPlayer.previous(); currentTrack--; server.send(200); });
    server.on("/volume", [](){ if(server.hasArg("level")){ currentVolume = server.arg("level").toInt(); myDFPlayer.volume(currentVolume); } server.send(200); });
    
    server.begin();
}

void loop() {
    server.handleClient();
    
    // Serial command: Gõ 'r' để reset WiFi settings
    if (Serial.available()) {
        char c = Serial.read();
        if (c == 'r') {
            Serial.println("Resetting WiFi settings...");
            wm.resetSettings();
            ESP.restart();
        } else if (c == 'v') {
            Serial.println("Voltage: " + String(readVoltage()) + "V");
        }
    }

    // OLED Update
    if (isPlaying) {
        anim.showMusicVisualizer(currentStatus, currentTrack, currentVolume, true);
    } else {
        anim.showLoadingDots(WiFi.localIP().toString());
    }

    if (myDFPlayer.available()) {
        if (myDFPlayer.readType() == DFPlayerPlayFinished) isPlaying = false;
    }
}

// --- WEB DASHBOARD ---
void handleRoot() {
  String html = R"=====(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>ESP32 Dynamic Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        :root { --primary: #6366f1; --bg: #0f172a; --card: rgba(30, 41, 59, 0.7); }
        body { font-family: 'Outfit', sans-serif; background: var(--bg); margin: 0; padding: 20px; color: white; }
        .container { max-width: 800px; margin: 0 auto; }
        .card { background: var(--card); backdrop-filter: blur(10px); border-radius: 20px; padding: 25px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1); }
        .stat { font-size: 2.5rem; font-weight: 600; color: var(--primary); margin: 10px 0; }
        .btn { background: var(--primary); border: none; color: white; padding: 15px; border-radius: 12px; cursor: pointer; flex: 1; transition: 0.3s; }
        .btn:hover { opacity: 0.8; transform: scale(0.98); }
        .controls { display: flex; gap: 10px; margin-top: 20px; }
        input[type=range] { width: 100%; accent-color: var(--primary); }
    </style>
</head>
<body>
    <div class="container">
        <h1 style="text-align:center">ESP32 Smart Controller</h1>
        <div class="card">
            <h3>⚡ Điện áp & Hệ thống</h3>
            <div class="stat" id="volt">--V</div>
            <p>IP: <span id="ip" style="color:var(--primary)">--</span></p>
            <p>Uptime: <span id="uptime">0</span>s</p>
        </div>
        <div class="card">
            <h3>🎵 Trình phát nhạc</h3>
            <div class="stat" id="track">#--</div>
            <p id="status">Đang tải...</p>
            <div class="controls">
                <button class="btn" onclick="fetch('/prev')">⏮️</button>
                <button class="btn" onclick="fetch('/play')">▶️</button>
                <button class="btn" onclick="fetch('/pause')">⏸️</button>
                <button class="btn" onclick="fetch('/next')">⏭️</button>
            </div>
            <br>
            <input type="range" min="0" max="30" id="vol" onchange="fetch('/volume?level='+this.value)">
            <p style="text-align:center" id="volTxt">15/30</p>
        </div>
    </div>
    <script>
        setInterval(() => {
            fetch('/status').then(r=>r.json()).then(d=>{
                document.getElementById('volt').innerText = d.voltage.toFixed(2) + 'V';
                document.getElementById('ip').innerText = d.wifi_ip;
                document.getElementById('uptime').innerText = d.uptime;
                document.getElementById('track').innerText = '#' + d.track;
                document.getElementById('status').innerText = d.status;
                document.getElementById('vol').value = d.volume;
                document.getElementById('volTxt').innerText = d.volume + '/30';
            });
        }, 2000);
    </script>
</body>
</html>
)=====";
  server.send(200, "text/html", html);
}

void handleStatus() {
    String j = "{";
    j += "\"status\":\"" + currentStatus + "\",";
    j += "\"track\":" + String(currentTrack) + ",";
    j += "\"volume\":" + String(currentVolume) + ",";
    j += "\"voltage\":" + String(readVoltage()) + ",";
    j += "\"uptime\":" + String(millis() / 1000) + ",";
    j += "\"wifi_ip\":\"" + WiFi.localIP().toString() + "\"";
    j += "}";
    server.send(200, "application/json", j);
}