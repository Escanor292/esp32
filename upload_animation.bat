@echo off
echo ========================================
echo ESP32 Animation Showcase
echo ========================================
echo.

echo Switching to animation-only mode...
copy platformio_animation_only.ini platformio.ini

echo.
echo Building animation showcase...
python -m platformio run
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo Build successful! Now uploading...
echo.
echo INSTRUCTIONS:
echo 1. Make sure OLED is connected:
echo    ESP32 GPIO21 -> OLED SDA
echo    ESP32 GPIO22 -> OLED SCL
echo    ESP32 3.3V   -> OLED VCC
echo    ESP32 GND    -> OLED GND
echo.
echo 2. Press any key to upload animation showcase
pause

echo Uploading animation showcase to ESP32...
python -m platformio run --target upload --upload-port COM9
if errorlevel 1 (
    echo Upload failed! Trying different ports...
    python -m platformio run --target upload --upload-port COM3
    if errorlevel 1 (
        python -m platformio run --target upload --upload-port COM4
        if errorlevel 1 (
            echo Upload failed on all ports!
            pause
            exit /b 1
        )
    )
)

echo.
echo ========================================
echo Animation Showcase Uploaded Successfully!
echo ========================================
echo.
echo Starting Serial Monitor...
echo You will see 16 different animations cycling every 4 seconds:
echo.
echo 1. Loading Dots          9. Startup Logo
echo 2. Progress Bar         10. Startup Loading  
echo 3. Bouncing Ball        11. Startup WiFi
echo 4. Sound Wave           12. Startup DFPlayer
echo 5. Spinning Circle      13. Startup Ready
echo 6. Pulsing Heart        14. Music Visualizer Playing
echo 7. Scrolling Text       15. Music Visualizer Paused
echo 8. Matrix Rain          16. Equalizer
echo.
echo Press Ctrl+C to exit monitor
echo.
python -m platformio device monitor --port COM9 --baud 115200

echo.
echo To restore audio player mode, run:
echo copy platformio.ini.backup platformio.ini
echo python -m platformio run --target upload --upload-port COM9
echo.
pause