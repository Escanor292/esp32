@echo off
echo ========================================
echo Restoring ESP32 Audio Player
echo ========================================
echo.

echo Switching back to audio player mode...
copy platformio.ini.backup platformio.ini

echo.
echo Building audio player...
python -m platformio run
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo Uploading audio player...
python -m platformio run --target upload --upload-port COM9

echo.
echo ========================================
echo Audio Player Restored!
echo ========================================
echo.
echo You can now access web interface at:
echo http://10.0.4.58
echo.
pause