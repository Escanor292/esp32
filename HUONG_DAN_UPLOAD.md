# 🔧 HƯỚNG DẪN UPLOAD CHƯƠNG TRÌNH LÊN ESP32

## ⚠️ VẤN ĐỀ HIỆN TẠI

Lỗi: **"Failed to communicate with the flash chip"**

Nguyên nhân: Có module khác (DFPlayer, OLED, LED) đang kết nối với các chân GPIO của ESP32, gây xung đột khi upload.

---

## ✅ GIẢI PHÁP (QUAN TRỌNG!)

### Bước 1: NGẮT KẾT NỐI TẤT CẢ MODULE

**BẮT BUỘC phải làm trước khi upload:**

```
❌ RÚT DÂY: DFPlayer Mini (GPIO 16, 17)
❌ RÚT DÂY: OLED Display (GPIO 21, 22)  
❌ RÚT DÂY: LED Strip (nếu có)
❌ RÚT DÂY: Speaker/Amplifier
❌ RÚT DÂY: Tất cả module khác

✅ CHỈ GIỮ: Cáp USB kết nối máy tính
```

### Bước 2: RESET ESP32

1. Nhấn nút **RESET** trên ESP32
2. Đợi 2 giây

### Bước 3: UPLOAD CHƯƠNG TRÌNH

#### Cách 1: Dùng PlatformIO (VS Code)

1. Mở VS Code
2. Mở thư mục dự án `d:\esp32`
3. Nhấn nút **Upload** (mũi tên →) ở thanh dưới
4. Hoặc nhấn `Ctrl+Alt+U`

#### Cách 2: Dùng Command Line

```bash
cd d:\esp32
python -m platformio run --target upload --upload-port COM9
```

#### Cách 3: Nếu vẫn lỗi - Xóa Flash trước

```bash
# Xóa flash
python -m platformio run --target erase

# Upload lại
python -m platformio run --target upload --upload-port COM9
```

### Bước 4: VÀO CHẾ ĐỘ BOOT (nếu cần)

Nếu thấy "Connecting....." không kết nối được:

1. **Nhấn giữ nút BOOT** trên ESP32
2. **Nhấn nút RESET** (giữ BOOT)
3. **Thả RESET** (vẫn giữ BOOT)
4. Đợi thấy "Uploading..."
5. **Thả BOOT**

---

## 📊 THÔNG TIN CHƯƠNG TRÌNH

- **Cổng COM**: COM9
- **Chip**: ESP32-D0WDQ6-V3 (revision v3.0)
- **MAC Address**: 4c:eb:d6:40:43:90
- **Tốc độ upload**: 115200 baud
- **Kích thước**:
  - RAM: 14.4% (47,276 bytes)
  - Flash: 29.5% (929,341 bytes)

---

## 🔄 SAU KHI UPLOAD THÀNH CÔNG

### 1. Kết nối lại các module

```
✅ Kết nối DFPlayer:
   - VCC → 5V
   - GND → GND
   - TX → GPIO 16
   - RX → GPIO 17 (qua điện trở 1kΩ)

✅ Kết nối OLED:
   - VCC → 3.3V
   - GND → GND
   - SDA → GPIO 21
   - SCL → GPIO 22

✅ Kết nối Speaker qua PAM8403
```

### 2. Mở Serial Monitor

```bash
python -m platformio device monitor --port COM9 --baud 115200
```

Hoặc trong VS Code: Nhấn nút **Serial Monitor** (🔌)

### 3. Kiểm tra hoạt động

Bạn sẽ thấy:
```
ESP32 SYSTEM
Khoi dong...
✅ WiFi Connected: 192.168.x.x
```

### 4. Cấu hình WiFi (lần đầu)

1. ESP32 sẽ tạo hotspot: **ESP32_Config_Portal**
2. Kết nối vào hotspot bằng điện thoại/laptop
3. Trình duyệt tự động mở trang cấu hình
4. Chọn WiFi và nhập mật khẩu
5. ESP32 sẽ kết nối và hiển thị IP

### 5. Truy cập Web Dashboard

1. Mở trình duyệt
2. Truy cập: `http://192.168.x.x` (IP hiển thị trên Serial Monitor)
3. Điều khiển nhạc qua giao diện web

---

## 🐛 TROUBLESHOOTING

### Lỗi: "Packet content transfer stopped"

**Nguyên nhân**: Module khác đang chiếm GPIO

**Giải pháp**:
1. Ngắt TẤT CẢ module
2. Chỉ giữ cáp USB
3. Upload lại

### Lỗi: "Could not open COM9"

**Nguyên nhân**: Cổng COM đang bị chiếm

**Giải pháp**:
1. Đóng tất cả Serial Monitor
2. Đóng Arduino IDE (nếu đang mở)
3. Rút và cắm lại cáp USB
4. Upload lại

### Lỗi: "Connecting....." không dừng

**Nguyên nhân**: ESP32 không vào chế độ boot

**Giải pháp**:
1. Nhấn giữ BOOT
2. Nhấn RESET (giữ BOOT)
3. Thả RESET (giữ BOOT)
4. Thả BOOT khi thấy "Uploading..."

### ESP32 không phát nhạc

**Kiểm tra**:
1. Thẻ SD đã format FAT32?
2. File MP3 trong thư mục `/mp3/`?
3. Tên file: 0001.mp3, 0002.mp3, ...?
4. DFPlayer kết nối đúng chân?
5. Speaker kết nối đúng cực?

---

## 📝 CHECKLIST TRƯỚC KHI UPLOAD

- [ ] Ngắt tất cả module (DFPlayer, OLED, LED, ...)
- [ ] Chỉ giữ cáp USB
- [ ] Nhấn RESET trên ESP32
- [ ] Đóng tất cả Serial Monitor
- [ ] Kiểm tra COM9 trong Device Manager
- [ ] Chạy lệnh upload

---

## 💡 MẸO

1. **Luôn ngắt module khi upload** - Tránh xung đột GPIO
2. **Dùng cáp USB tốt** - Cáp kém gây lỗi truyền dữ liệu
3. **Nguồn đủ 2A** - Không đủ nguồn sẽ reset liên tục
4. **Kiểm tra kết nối** - Dây lỏng gây lỗi ngẫu nhiên
5. **Backup code** - Luôn có bản sao lưu

---

**Tác giả**: Development Team  
**Cập nhật**: 2024-09-01
