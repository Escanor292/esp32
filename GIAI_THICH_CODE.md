# 📖 GIẢI THÍCH CODE CHI TIẾT - MÁY ĐỌC THÔNG BÁO THANH TOÁN

## 📋 Mục Lục
1. [Tổng Quan](#tổng-quan)
2. [Thư Viện Sử Dụng](#thư-viện-sử-dụng)
3. [Cấu Hình Phần Cứng](#cấu-hình-phần-cứng)
4. [Class Animations](#class-animations)
5. [Hàm Setup](#hàm-setup)
6. [Hàm Loop](#hàm-loop)
7. [Web Server](#web-server)
8. [Giải Thích Từng Dòng Code](#giải-thích-từng-dòng-code)

---

## 🎯 Tổng Quan

Đây là code cho **máy đọc thông báo thanh toán** sử dụng ESP32. Chức năng chính:

- ✅ Kết nối WiFi tự động
- ✅ Phát nhạc MP3 từ thẻ SD
- ✅ Hiển thị thông tin trên màn hình OLED
- ✅ Điều khiển qua Web Dashboard
- ✅ Đọc điện áp pin

---

## 📚 Thư Viện Sử Dụng

```cpp
#include <Arduino.h>              // Thư viện cơ bản của Arduino
#include <WiFi.h>                 // Kết nối WiFi
#include <WebServer.h>            // Tạo web server
#include <HardwareSerial.h>       // Giao tiếp UART với DFPlayer
#include <DFRobotDFPlayerMini.h>  // Điều khiển DFPlayer Mini
#include <Wire.h>                 // Giao tiếp I2C với OLED
#include <Adafruit_GFX.h>         // Thư viện đồ họa
#include <Adafruit_SSD1306.h>     // Điều khiển màn hình OLED
#include <WiFiManager.h>          // Cấu hình WiFi động
```

### Giải thích:
- **Arduino.h**: Thư viện cơ bản, bắt buộc phải có
- **WiFi.h**: Để ESP32 kết nối WiFi
- **WebServer.h**: Tạo trang web điều khiển
- **DFRobotDFPlayerMini.h**: Điều khiển module phát nhạc MP3
- **Adafruit_SSD1306.h**: Điều khiển màn hình OLED
- **WiFiManager.h**: Tự động kết nối WiFi hoặc tạo hotspot để cấu hình

---

## 🔧 Cấu Hình Phần Cứng

```cpp
#define SCREEN_WIDTH 128      // Chiều rộng màn hình OLED (128 pixel)
#define SCREEN_HEIGHT 64      // Chiều cao màn hình OLED (64 pixel)
#define OLED_RESET -1         // Không dùng chân reset cho OLED
#define VOLT_PIN 34           // Chân đọc điện áp (GPIO 34)
```

### Giải thích:
- **SCREEN_WIDTH/HEIGHT**: Kích thước màn hình OLED 128x64
- **OLED_RESET -1**: Không cần chân reset riêng
- **VOLT_PIN 34**: Chân GPIO 34 để đọc điện áp pin

---

## 🎨 Class Animations

Class này quản lý hiển thị trên màn hình OLED.

### 1. Khởi tạo Class

```cpp
class Animations {
private:
    Adafruit_SSD1306* display;        // Con trỏ đến màn hình OLED
    int animationFrame;                // Khung hình hiện tại của animation
    unsigned long lastAnimationTime;   // Thời gian cập nhật animation cuối

public:
    Animations(Adafruit_SSD1306* d) : display(d), animationFrame(0), lastAnimationTime(0) {}
```

**Giải thích**:
- `display`: Lưu địa chỉ màn hình OLED
- `animationFrame`: Đếm số khung hình để tạo hiệu ứng động
- `lastAnimationTime`: Lưu thời gian để kiểm soát tốc độ animation

### 2. Hàm showStatus

```cpp
void showStatus(String line1, String line2, String line3) {
    display->clearDisplay();              // Xóa màn hình
    display->setTextSize(1);              // Kích thước chữ = 1
    display->setTextColor(SSD1306_WHITE); // Màu chữ trắng
    
    display->setCursor(0, 0);             // Vị trí dòng 1
    display->println(line1);              // In dòng 1
    
    display->setCursor(0, 20);            // Vị trí dòng 2
    display->println(line2);              // In dòng 2
    
    display->setCursor(0, 40);            // Vị trí dòng 3
    display->println(line3);              // In dòng 3
    
    display->display();                   // Cập nhật màn hình
}
```

**Giải thích**:
- Hiển thị 3 dòng text trên màn hình
- `clearDisplay()`: Xóa nội dung cũ
- `setCursor(x, y)`: Đặt vị trí con trỏ
- `display()`: Cập nhật màn hình (bắt buộc)

### 3. Hàm showLoadingDots

```cpp
void showLoadingDots(String text, int speed = 200) {
    if (millis() - lastAnimationTime > speed) {  // Kiểm tra đã đủ thời gian chưa
        display->clearDisplay();
        
        // Hiển thị text ở giữa màn hình
        display->setCursor((SCREEN_WIDTH - text.length() * 6) / 2, 20);
        display->println(text);
        
        // Tạo dấu chấm động (. .. ... ....)
        String dots = "";
        for (int i = 0; i < (animationFrame % 4); i++) {
            dots += ".";
        }
        
        display->setCursor((SCREEN_WIDTH - dots.length() * 6) / 2, 35);
        display->println(dots);
        display->display();
        
        animationFrame++;                    // Tăng khung hình
        lastAnimationTime = millis();        // Cập nhật thời gian
    }
}
```

**Giải thích**:
- Tạo hiệu ứng loading với dấu chấm động
- `millis()`: Lấy thời gian hiện tại (milliseconds)
- `animationFrame % 4`: Lặp lại từ 0-3 (0 chấm, 1 chấm, 2 chấm, 3 chấm)
- `text.length() * 6`: Tính độ rộng text (mỗi ký tự rộng 6 pixel)

### 4. Hàm showMusicVisualizer

```cpp
void showMusicVisualizer(String status, int track, int vol, bool playing, int speed = 100) {
    if (millis() - lastAnimationTime > speed) {
        display->clearDisplay();
        
        // Hiển thị thông tin
        display->setCursor(0, 0);
        display->println(status);           // Trạng thái (Đang phát, Tạm dừng...)
        
        display->setCursor(0, 15);
        display->print("Track: #");
        display->println(track);            // Số bài hát
        
        display->setCursor(0, 30);
        display->print("Vol: ");
        display->println(vol);              // Âm lượng
        
        // Vẽ thanh nhạc động nếu đang phát
        if (playing) {
            for (int i = 0; i < 6; i++) {
                int h = random(5, 20);      // Chiều cao ngẫu nhiên 5-20 pixel
                display->fillRect(70 + i*8, 45 - h, 5, h, SSD1306_WHITE);
            }
        }
        
        display->display();
        lastAnimationTime = millis();
    }
}
```

**Giải thích**:
- Hiển thị trạng thái phát nhạc
- `random(5, 20)`: Tạo số ngẫu nhiên từ 5-20
- `fillRect(x, y, width, height, color)`: Vẽ hình chữ nhật
- Tạo 6 thanh nhạc động khi đang phát

---

## 🚀 Hàm Setup (Khởi động)

### 1. Khởi tạo Serial và I2C

```cpp
void setup() {
    Serial.begin(115200);    // Khởi động Serial với tốc độ 115200 baud
    Wire.begin(21, 22);      // Khởi động I2C: SDA=GPIO21, SCL=GPIO22
```

**Giải thích**:
- `Serial.begin(115200)`: Mở cổng Serial để debug
- `Wire.begin(21, 22)`: Khởi động I2C cho OLED (SDA=21, SCL=22)

### 2. Cấu hình ADC (Đọc điện áp)

```cpp
    analogReadResolution(12);      // Độ phân giải 12-bit (0-4095)
    analogSetAttenuation(ADC_11db); // Cho phép đọc đến 3.3V
```

**Giải thích**:
- `analogReadResolution(12)`: Đọc giá trị từ 0-4095 (12 bit)
- `analogSetAttenuation(ADC_11db)`: Mở rộng dải đo đến 3.3V

### 3. Khởi động OLED

```cpp
    if(display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        anim.begin();
        anim.showStatus("ESP32 SYSTEM", "Khoi dong...", "");
    }
```

**Giải thích**:
- `0x3C`: Địa chỉ I2C của màn hình OLED
- `SSD1306_SWITCHCAPVCC`: Sử dụng nguồn 3.3V nội
- Hiển thị "ESP32 SYSTEM" khi khởi động

### 4. Khởi động DFPlayer

```cpp
    dfSerial.begin(9600, SERIAL_8N1, 16, 17);  // UART: RX=16, TX=17
    
    if (myDFPlayer.begin(dfSerial)) {
        myDFPlayer.volume(currentVolume);       // Đặt âm lượng
        myDFPlayer.outputDevice(DFPLAYER_DEVICE_SD); // Chọn thẻ SD
        currentStatus = "Sẵn sàng";
    }
```

**Giải thích**:
- `9600`: Tốc độ UART của DFPlayer
- `SERIAL_8N1`: 8 bit data, No parity, 1 stop bit
- `RX=16, TX=17`: Chân kết nối với DFPlayer
- `outputDevice(DFPLAYER_DEVICE_SD)`: Chọn phát từ thẻ SD

### 5. Cấu hình WiFi với WiFiManager

```cpp
    wm.setAPCallback(configModeCallback);  // Callback khi vào chế độ config
    wm.setConfigPortalTimeout(180);        // Timeout 3 phút
    
    // Tự động kết nối hoặc tạo hotspot "ESP32_Config_Portal"
    if(!wm.autoConnect("ESP32_Config_Portal")) {
        Serial.println("Kết nối thất bại, đang reset...");
        delay(3000);
        ESP.restart();
    }
```

**Giải thích**:
- `autoConnect()`: Tự động kết nối WiFi đã lưu
- Nếu chưa có WiFi → Tạo hotspot "ESP32_Config_Portal"
- Người dùng kết nối vào hotspot để cấu hình WiFi
- Timeout 180 giây (3 phút)

### 6. Khởi động Web Server

```cpp
    server.on("/", handleRoot);           // Trang chủ
    server.on("/status", handleStatus);   // API trạng thái
    
    // Các endpoint điều khiển
    server.on("/play", [](){ 
        myDFPlayer.start(); 
        isPlaying = true; 
        currentStatus = "Đang phát"; 
        server.send(200); 
    });
    
    server.on("/pause", [](){ 
        myDFPlayer.pause(); 
        isPlaying = false; 
        currentStatus = "Tạm dừng"; 
        server.send(200); 
    });
    
    server.begin();  // Khởi động server
```

**Giải thích**:
- `server.on(path, handler)`: Đăng ký endpoint
- Lambda function `[](){}`: Hàm ngắn gọn
- `/play`: Phát nhạc
- `/pause`: Tạm dừng
- `/stop`: Dừng
- `/next`: Bài tiếp theo
- `/prev`: Bài trước
- `/volume?level=15`: Đặt âm lượng

---

## 🔄 Hàm Loop (Vòng lặp chính)

```cpp
void loop() {
    server.handleClient();  // Xử lý request từ web
    
    // Xử lý lệnh Serial
    if (Serial.available()) {
        char c = Serial.read();
        if (c == 'r') {
            Serial.println("Resetting WiFi settings...");
            wm.resetSettings();  // Xóa WiFi đã lưu
            ESP.restart();       // Khởi động lại
        } else if (c == 'v') {
            Serial.println("Voltage: " + String(readVoltage()) + "V");
        }
    }
    
    // Cập nhật OLED
    if (isPlaying) {
        anim.showMusicVisualizer(currentStatus, currentTrack, currentVolume, true);
    } else {
        anim.showLoadingDots(WiFi.localIP().toString());
    }
    
    // Kiểm tra DFPlayer
    if (myDFPlayer.available()) {
        if (myDFPlayer.readType() == DFPlayerPlayFinished) {
            isPlaying = false;
        }
    }
}
```

**Giải thích**:
- `server.handleClient()`: Xử lý request HTTP
- `Serial.available()`: Kiểm tra có dữ liệu Serial không
- Gõ 'r' → Reset WiFi
- Gõ 'v' → Hiển thị điện áp
- Cập nhật OLED theo trạng thái
- Kiểm tra bài hát đã phát xong chưa

---

## 🌐 Web Server

### 1. Hàm handleRoot (Trang chủ)

```cpp
void handleRoot() {
  String html = R"=====(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>ESP32 Dynamic Dashboard</title>
    ...
</head>
<body>
    <div class="container">
        <h1>ESP32 Smart Controller</h1>
        
        <!-- Card hiển thị điện áp -->
        <div class="card">
            <h3>⚡ Điện áp & Hệ thống</h3>
            <div class="stat" id="volt">--V</div>
            <p>IP: <span id="ip">--</span></p>
            <p>Uptime: <span id="uptime">0</span>s</p>
        </div>
        
        <!-- Card điều khiển nhạc -->
        <div class="card">
            <h3>🎵 Trình phát nhạc</h3>
            <div class="stat" id="track">#--</div>
            <p id="status">Đang tải...</p>
            
            <!-- Nút điều khiển -->
            <div class="controls">
                <button onclick="fetch('/prev')">⏮️</button>
                <button onclick="fetch('/play')">▶️</button>
                <button onclick="fetch('/pause')">⏸️</button>
                <button onclick="fetch('/next')">⏭️</button>
            </div>
            
            <!-- Thanh âm lượng -->
            <input type="range" min="0" max="30" id="vol" 
                   onchange="fetch('/volume?level='+this.value)">
        </div>
    </div>
    
    <!-- JavaScript tự động cập nhật -->
    <script>
        setInterval(() => {
            fetch('/status').then(r=>r.json()).then(d=>{
                document.getElementById('volt').innerText = d.voltage.toFixed(2) + 'V';
                document.getElementById('ip').innerText = d.wifi_ip;
                document.getElementById('uptime').innerText = d.uptime;
                document.getElementById('track').innerText = '#' + d.track;
                document.getElementById('status').innerText = d.status;
                document.getElementById('vol').value = d.volume;
            });
        }, 2000);  // Cập nhật mỗi 2 giây
    </script>
</body>
</html>
)=====";
  server.send(200, "text/html", html);
}
```

**Giải thích**:
- `R"====(...)====="`: Raw string literal (không cần escape)
- `fetch('/status')`: Gọi API lấy trạng thái
- `setInterval(..., 2000)`: Tự động cập nhật mỗi 2 giây
- `onclick="fetch('/play')"`: Gọi API khi click nút

### 2. Hàm handleStatus (API trạng thái)

```cpp
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
```

**Giải thích**:
- Tạo JSON string chứa thông tin hệ thống
- `millis() / 1000`: Thời gian hoạt động (giây)
- `WiFi.localIP()`: Địa chỉ IP của ESP32
- Trả về JSON cho web dashboard

---

## 🔋 Hàm readVoltage (Đọc điện áp)

```cpp
float readVoltage() {
    int pins[] = {34, 35, 36};  // 3 chân ADC
    float maxV = 0;
    
    // Đọc từ 3 chân và lấy giá trị cao nhất
    for(int p : pins) {
        long sum = 0;
        
        // Đọc 5 lần và tính trung bình
        for(int i=0; i<5; i++) {
            sum += analogRead(p);
        }
        
        // Chuyển đổi sang điện áp
        float v = (sum / 5.0 / 4095.0) * 3.3 * 2.0;
        
        if(v > maxV) maxV = v;  // Lấy giá trị cao nhất
    }
    return maxV;
}
```

**Giải thích**:
- Đọc từ 3 chân ADC (34, 35, 36)
- Đọc 5 lần và tính trung bình để giảm nhiễu
- `analogRead()`: Trả về 0-4095 (12-bit)
- Công thức: `(giá_trị / 4095) * 3.3V * 2.0` (có chia áp)
- Lấy giá trị cao nhất từ 3 chân

---

## 📝 Tóm Tắt Luồng Hoạt Động

```
1. KHỞI ĐỘNG
   ├─ Khởi tạo Serial, I2C, ADC
   ├─ Khởi động OLED
   ├─ Khởi động DFPlayer
   └─ Kết nối WiFi (tự động hoặc config)

2. CHẠY LIÊN TỤC (Loop)
   ├─ Xử lý request HTTP từ web
   ├─ Xử lý lệnh Serial (r, v)
   ├─ Cập nhật OLED
   └─ Kiểm tra trạng thái DFPlayer

3. WEB DASHBOARD
   ├─ Hiển thị thông tin (điện áp, IP, uptime)
   ├─ Điều khiển nhạc (play, pause, next, prev)
   └─ Tự động cập nhật mỗi 2 giây
```

---

## 🎯 Các Tính Năng Chính

### 1. Kết Nối WiFi Tự Động
- Tự động kết nối WiFi đã lưu
- Nếu chưa có → Tạo hotspot để cấu hình
- Gõ 'r' trong Serial để reset WiFi

### 2. Phát Nhạc MP3
- Phát từ thẻ SD
- Điều khiển: Play, Pause, Stop, Next, Previous
- Điều chỉnh âm lượng 0-30

### 3. Hiển Thị OLED
- Hiển thị trạng thái hệ thống
- Animation loading dots
- Music visualizer khi phát nhạc

### 4. Web Dashboard
- Giao diện đẹp, responsive
- Hiển thị điện áp, IP, uptime
- Điều khiển nhạc qua web
- Tự động cập nhật

### 5. Đọc Điện Áp
- Đọc từ 3 chân ADC
- Tính trung bình 5 lần
- Hiển thị trên web

---

## 🔧 Cách Sử Dụng

### 1. Lần Đầu Khởi Động
```
1. Upload code lên ESP32
2. Mở Serial Monitor (115200 baud)
3. ESP32 sẽ tạo hotspot "ESP32_Config_Portal"
4. Kết nối vào hotspot bằng điện thoại/laptop
5. Trình duyệt tự động mở trang cấu hình
6. Chọn WiFi và nhập mật khẩu
7. ESP32 sẽ kết nối và hiển thị IP
```

### 2. Sử Dụng Web Dashboard
```
1. Mở trình duyệt
2. Truy cập IP của ESP32 (hiển thị trên Serial/OLED)
3. Điều khiển nhạc qua giao diện web
```

### 3. Reset WiFi
```
1. Mở Serial Monitor
2. Gõ 'r' và Enter
3. ESP32 sẽ xóa WiFi và khởi động lại
```

---

## 🐛 Debug và Troubleshooting

### Kiểm tra Serial
```cpp
Serial.println("Debug message");  // In ra Serial Monitor
```

### Kiểm tra điện áp
```
Gõ 'v' trong Serial Monitor
```

### Kiểm tra WiFi
```
Xem IP trên Serial Monitor hoặc OLED
```

### Kiểm tra DFPlayer
```
- Đảm bảo thẻ SD format FAT32
- File MP3 đặt trong thư mục /mp3/
- Tên file: 0001.mp3, 0002.mp3, ...
```

---

## 📚 Tài Liệu Tham Khảo

- ESP32: https://docs.espressif.com/
- DFPlayer: https://wiki.dfrobot.com/
- OLED SSD1306: https://learn.adafruit.com/
- WiFiManager: https://github.com/tzapu/WiFiManager

---

**Tác giả**: Development Team
**Phiên bản**: 1.0.0
**Ngày cập nhật**: 2024-09-01

