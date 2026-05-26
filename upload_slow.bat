@echo off
echo ========================================
echo ESP32 Upload with Slow Speed
echo ========================================
echo.
echo IMPORTANT: Before uploading
echo 1. Disconnect ALL wires from ESP32 (except USB)
echo 2. Remove DFPlayer, OLED, and other modules
echo 3. Only connect ESP32 via USB cable
echo.
pause

echo Erasing flash first...
python -m platformio run --target erase

echo.
echo Now uploading with slow speed...
echo Hold BOOT button when you see "Connecting..."
echo.
python -m platformio run --target upload --upload-port COM9

echo.
echo Done! You can reconnect the modules now.
pause
