# Hệ Thống Thông Báo Nhận Tiền Thông Minh (SePay + ESP32)

Dự án này là một hệ thống thông báo nhận tiền thông minh kết hợp IoT (ESP32) và Web API. Khi có người chuyển tiền vào tài khoản ngân hàng (thông qua cổng thanh toán SePay), hệ thống sẽ hoạt động theo luồng:
1. Webhook từ SePay tự động gửi thông tin giao dịch đến Backend.
2. Backend xử lý, lưu vào cơ sở dữ liệu, cập nhật lên Dashboard theo thời gian thực và gửi tín hiệu qua MQTT.
3. ESP32 nhận tín hiệu MQTT, hiển thị thông tin lên màn hình OLED, phát âm thanh thông báo nhận tiền qua loa và chạy hiệu ứng đèn LED báo hiệu.

---

## 🏗️ Các chương trình trong dự án

Dự án này bao gồm 3 chương trình (mô-đun) chính và một số file test phụ trợ:

### 1. Firmware ESP32 (`src/` & `include/`)
* **Công dụng:** Chương trình điều khiển phần cứng của thiết bị đầu cuối (ESP32) được viết bằng C++ (PlatformIO).
* **Tính năng:**
  - Quản lý kết nối WiFi và MQTT Broker.
  - Lắng nghe thông báo giao dịch từ Backend qua MQTT.
  - Hiển thị thông tin giao dịch và mã QR Code lên màn hình OLED.
  - Đọc số tiền bằng tiếng Việt thông qua module MP3 DFPlayer Mini.
  - Điều khiển dải đèn LED (NeoPixel) bằng thư viện tùy chỉnh (`animations.cpp`).

### 2. Backend Server (`backend/`)
* **Công dụng:** Máy chủ trung gian kết nối các dịch vụ, xử lý thanh toán và giao tiếp với ESP32.
* **Tính năng:**
  - Xây dựng bằng Node.js & Express.
  - Cung cấp API để nhận Webhook từ dịch vụ SePay.
  - Kết nối với MQTT Broker để gửi lệnh xuống phần cứng ESP32.
  - Quản lý cơ sở dữ liệu giao dịch và thông tin thu chi cá nhân (SQL).

### 3. Web Dashboard (`dashboard/`)
* **Công dụng:** Giao diện quản lý thống kê dành cho người dùng trên trình duyệt.
* **Tính năng:**
  - Ứng dụng Frontend viết bằng React (Vite).
  - Hiển thị tình trạng kết nối thiết bị ESP32 (Online/Offline).
  - Bảng thống kê thu/chi và lịch sử giao dịch được cập nhật theo thời gian thực (Real-time).
  - Chức năng tạo mã QR tĩnh.

### 4. Các file Test & Phụ trợ
* `esp32_dfplayer_web.ino` / `esp32_web_buzzer.ino`: Mã nguồn độc lập trên Arduino IDE dùng để test tính năng Web Server và âm thanh.
* `src/test_dfplayer.cpp` / `src/test_step_by_step.cpp`: Các file để unit test từng linh kiện phần cứng cụ thể trước khi lắp ráp thành phẩm.

---

## 📦 Tài liệu liên quan

- **[DANH_SACH_LINH_KIEN.md](DANH_SACH_LINH_KIEN.md)** - Danh sách chi tiết tất cả linh kiện cần thiết
- **[GIAI_THICH_CODE.md](GIAI_THICH_CODE.md)** - Giải thích code chi tiết từng dòng
- **[circuit_diagram.txt](circuit_diagram.txt)** - Sơ đồ kết nối phần cứng

---

## 🚀 Hướng dẫn chạy dự án (Quick Start)

### Chạy Backend
```bash
cd backend
npm install
npm run dev # Hoặc node server.js / node sepay-server.js
```

### Chạy Dashboard
```bash
cd dashboard
npm install
npm start
```

### Nạp code cho ESP32
1. Sử dụng VS Code có cài đặt extension **PlatformIO**.
2. Mở thư mục gốc của dự án.
3. Chỉnh sửa thông tin WiFi và cấu hình MQTT trong file `src/main.cpp`.
4. Cắm mạch ESP32 vào máy tính và nhấn **Upload**.