# 📦 DANH SÁCH LINH KIỆN - DỰ ÁN ESP32 PAYMENT NOTIFICATION
> **Cập nhật:** 2026-05-26 | **Phiên bản:** 2.0

---

## 🔴 LINH KIỆN THỰC TẾ ĐÃ CÓ

### 1. 🎛️ Kit ESP32 Wifi + Bluetooth — ESP32-CP210-M (kèm cáp 1m)

| Thông số | Chi tiết |
|----------|----------|
| Model | ESP32-CP210-M |
| Vi xử lý | Dual-core Xtensa 32-bit LX6 @ 240MHz |
| WiFi | 802.11 b/g/n (2.4GHz) |
| Bluetooth | v4.2 BR/EDR + BLE |
| Chip nạp | CP2102 (USB-to-UART) |
| GPIO | 34 chân |
| UART | 3 cổng (UART0, UART1, UART2) |
| I2C | 2 cổng |
| Flash | 4MB |
| SRAM | 520KB |
| Nguồn vào | 5V qua cổng USB |
| Nguồn ra | Chân 5V (thẳng từ USB), chân 3V3 |

**Chân sử dụng trong dự án:**

| Chân ESP32 | Kết nối | Ghi chú |
|------------|---------|---------|
| USB (cổng) | Nguồn USB 5V/2A | Cấp nguồn toàn hệ |
| 5V | DFPlayer VCC, PAM8403 VCC, Tụ (+) | Lấy thẳng từ USB |
| 3V3 | OLED VCC | Nguồn ổn định 3.3V |
| GND | Tất cả GND | Mass chung |
| GPIO16 RX2 | DFPlayer TX | UART nhận |
| GPIO17 TX2 | [1kΩ] → DFPlayer RX/PX | UART gửi |
| GPIO21 SDA | OLED SDA | I2C Data |
| GPIO22 SCL | OLED SCL | I2C Clock |

---

### 2. 🎵 DFPlayer Mini MP3 Module — MP3-TF-16P

| Thông số | Chi tiết |
|----------|----------|
| Model | MP3-TF-16P |
| Chip | YX5200-24SS |
| Format | MP3, WAV, WMA |
| Tần số lấy mẫu | 8KHz – 48KHz |
| Đầu ra DAC | 16-bit |
| Giao tiếp | UART (9600 baud) |
| Thẻ nhớ | Micro SD (TF card), hỗ trợ 1GB – 128GB |
| Điện áp | 3.2V – 5V |
| Dòng điện | 24mA (chờ), 200mA (đang phát) |
| SNR | > 85dB |

**Kết nối:**

| Chân DFPlayer | Kết nối | Ghi chú |
|---------------|---------|---------|
| VCC | ESP32 5V | Nguồn cấp |
| GND | ESP32 GND | Mass + PAM8403 GND |
| RX / PX | [1kΩ] ← ESP32 GPIO17 | Có điện trở bảo vệ |
| TX | ESP32 GPIO16 | Gửi trạng thái |
| DAC_R | PAM8403 R IN | Tín hiệu audio (mono) |

**Lưu ý:**
- Thẻ SD format **FAT32**, tạo thư mục `/mp3/`
- Tên file: `0001.mp3`, `0002.mp3`, ... (4 chữ số)
- **BẮT BUỘC** điện trở 1kΩ trên đường RX/PX

---

### 3. 🔊 Module Khuếch Đại Âm Thanh PAM8403 — 2×3W, 2.5–5V

| Thông số | Chi tiết |
|----------|----------|
| Chip | PAM8403 (Class-D) |
| Phân loại | Điều chỉnh PAM8304 |
| Công suất | 2×3W (4Ω) / 2×2.5W (8Ω) |
| Điện áp | 2.5V – 5V (USB 5V) |
| Hiệu suất | > 90% |
| THD+N | < 10% (1W, 8Ω) |
| Dải tần | 20Hz – 20KHz |
| Bảo vệ | Tắt nhiệt, tắt quá dòng |
| Tính năng | Có biến trở chỉnh âm lượng |

**Kết nối (chỉ dùng kênh R - Mono):**

| Chân PAM8403 | Kết nối | Ghi chú |
|--------------|---------|---------|
| VCC | ESP32 5V | Nguồn cấp |
| GND | ESP32 GND / DFPlayer GND | Mass chung |
| R IN | DFPlayer DAC_R | Tín hiệu vào kênh phải |
| R OUT+ | Loa (+) | Ra loa dương |
| R OUT- | Loa (-) | Ra loa âm |

---

### 4. 📺 Màn Hình OLED 0.96" IIC I2C — 128×64

| Thông số | Chi tiết |
|----------|----------|
| Kích thước | 0.96 inch |
| Độ phân giải | 128 × 64 pixels |
| Driver | SSD1306 |
| Giao tiếp | I2C (IIC) |
| Số chân | 4 pin hoặc 7 pin |
| Địa chỉ I2C | 0x3C (mặc định) |
| Điện áp | 3.3V (dùng chân 3V3 của ESP32) |
| Dòng điện | ~20mA |
| Góc nhìn | > 160° |

**Kết nối:**

| Chân OLED | Kết nối | Ghi chú |
|-----------|---------|---------|
| VCC | ESP32 3V3 | Dùng 3.3V, không dùng 5V |
| GND | ESP32 GND | Mass chung |
| SCL | ESP32 GPIO22 | I2C Clock |
| SDA | ESP32 GPIO21 | I2C Data |

**Thư viện:** `Adafruit_SSD1306` + `Adafruit_GFX`

---

### 5. 🔉 Loa ZIQQUCU DIY — 8 Ohm 3W Hình Oval Từ Tính

| Thông số | Chi tiết |
|----------|----------|
| Thương hiệu | ZIQQUCU |
| Loại | DIY full-range, hình oval |
| Trở kháng | 8 Ω |
| Công suất | 3W (RMS) |
| Loại từ | Từ tính (nam châm) |

**Kết nối:**

| Dây loa | Kết nối | Ghi chú |
|---------|---------|---------|
| Loa (+) | PAM8403 R OUT+ | Cực dương |
| Loa (-) | PAM8403 R OUT- | Cực âm |

---

### 6. 💾 Thẻ Nhớ Micro SD — Bóc Máy Đã Format, 1GB – 128GB

| Thông số | Chi tiết |
|----------|----------|
| Dung lượng | 1GB – 128GB |
| Tình trạng | Bóc máy, đã format sạch |
| Format yêu cầu | FAT32 |

**Chuẩn bị thẻ SD:**
1. Format thành **FAT32** (nếu chưa)
2. Tạo thư mục: `/mp3/`
3. Copy file MP3 vào `/mp3/`
4. Đặt tên file: `0001.mp3`, `0002.mp3`, ..., `0020.mp3`
5. Cắm vào khe TF card của DFPlayer

---

### 7. ⚡ Điện Trở 1/4W — Gói 100 Con

| Thông số | Chi tiết |
|----------|----------|
| Công suất | 1/4W (0.25W) |
| Giá trị dùng | 1kΩ (Nâu – Đen – Đỏ – Vàng) |
| Dung sai | ±5% |
| Số lượng dùng | 1 con |

**Công dụng:**
- Mắc giữa ESP32 GPIO17 và DFPlayer RX/PX
- Bảo vệ DFPlayer khỏi logic 3.3V của ESP32
- **Không bỏ qua điện trở này**

---

### 8. 🔋 Tụ Điện Nhôm — 16V 1000UF (8×16mm)

| Thông số | Chi tiết |
|----------|----------|
| Dung lượng | 1000µF |
| Điện áp | 16V |
| Loại | Electrolytic (tụ phân cực) |
| Kích thước | 8mm × 16mm |
| Dung sai | ±20% |

**Kết nối:**

| Chân tụ | Kết nối | Ghi chú |
|---------|---------|---------|
| Chân (+) dài | ESP32 5V | ⚠️ Không đấu ngược |
| Chân (-) sọc | ESP32 GND | Chân có sọc trắng = âm |

**Công dụng:** Lọc nguồn, giảm nhiễu khi PAM8403 hoạt động

---

## 📊 TỔNG HỢP KẾT NỐI

```
Nguồn USB 5V/2A
    │
    └──► Cổng USB ESP32
              │
    ┌─────────┴──────────┐
  5V pin               3V3 pin
    │                    │
    ├──► DFPlayer VCC    └──► OLED VCC
    ├──► PAM8403 VCC
    └──► Tụ 1000uF (+)

ESP32 GPIO17 TX2 ──[1kΩ]──► DFPlayer RX/PX
ESP32 GPIO16 RX2 ◄────────── DFPlayer TX
ESP32 GPIO22 SCL ──────────► OLED SCL
ESP32 GPIO21 SDA ──────────► OLED SDA

DFPlayer DAC_R ────────────► PAM8403 R IN
DFPlayer GND   ────────────► PAM8403 GND
PAM8403 R OUT+ ────────────► Loa (+)
PAM8403 R OUT- ────────────► Loa (-)

GND chung: ESP32 GND ←─── DFPlayer GND ←─── PAM8403 GND ←─── OLED GND ←─── Tụ (-)
```

---

## ⚠️ LƯU Ý QUAN TRỌNG

1. **Nguồn:** USB cắm vào **cổng USB của ESP32** (không phải VIN)
2. **Điện trở 1kΩ:** BẮT BUỘC giữa GPIO17 và DFPlayer RX/PX
3. **Tụ 1000uF:** Chú ý cực tính — chân dài = (+), vạch sọc = (-)
4. **OLED dùng 3V3:** Không dùng 5V cho OLED
5. **Mono:** Chỉ dùng DAC_R + kênh R của PAM8403 + 1 loa
6. **GND chung:** Tất cả module phải chung GND

---

**Tác giả:** Development Team
**Phiên bản:** 2.0
**Ngày cập nhật:** 2026-05-26
