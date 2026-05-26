#ifndef CONFIG_H
#define CONFIG_H

// Cấu hình WiFi
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Cấu hình chân kết nối
#define DFPLAYER_RX_PIN 16
#define DFPLAYER_TX_PIN 17
#define OLED_SDA_PIN 21
#define OLED_SCL_PIN 22

// Cấu hình OLED
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDRESS 0x3C

// Cấu hình DFPlayer
#define DFPLAYER_BAUD 9600
#define MAX_TRACKS 20
#define DEFAULT_VOLUME 15
#define MAX_VOLUME 30

// Cấu hình Web Server
#define WEB_SERVER_PORT 80
#define SERIAL_BAUD 115200

// Cấu hình hiển thị
#define STATUS_UPDATE_INTERVAL 5000  // 5 giây

#endif