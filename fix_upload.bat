@echo off
echo ========================================
echo ESP32 Upload Fix Script
echo ========================================
echo.
echo Detected: COM9 (CP210x USB to UART Bridge)
echo.
echo IMPORTANT STEPS:
echo 1. Disconnect ALL modules from ESP32 (DFPlayer, OLED, LEDs)
echo 2. Only keep USB cable connected
echo 3. Press RESET button on ESP32 now
echo.
pause

echo.
echo Trying Method 1: Direct esptool with no-stub...
python -m esptool --chip esp32 --port COM9 --baud 115200 --before default_reset --after hard_reset write_flash -z --flash_mode dio --flash_freq 40m --flash_size detect 0x1000 .pio\build\esp32dev\bootloader.bin 0x8000 .pio\build\esp32dev\partitions.bin 0xe000 .pio\build\esp32dev\boot_app0.bin 0x10000 .pio\build\esp32dev\firmware.bin

if errorlevel 1 (
    echo.
    echo Method 1 failed. Trying Method 2: Erase flash first...
    echo Hold BOOT button when you see "Connecting..."
    pause
    
    python -m esptool --chip esp32 --port COM9 --baud 115200 erase_flash
    
    echo.
    echo Now uploading...
    python -m esptool --chip esp32 --port COM9 --baud 115200 --before default_reset --after hard_reset write_flash -z --flash_mode dio --flash_freq 40m --flash_size detect 0x1000 .pio\build\esp32dev\bootloader.bin 0x8000 .pio\build\esp32dev\partitions.bin 0xe000 .pio\build\esp32dev\boot_app0.bin 0x10000 .pio\build\esp32dev\firmware.bin
)

echo.
echo ========================================
echo Upload completed!
echo ========================================
pause
