@echo off
echo ========================================
echo ESP32 Audio Player Upload Script
echo ========================================
echo.

echo Checking PlatformIO...
python -m platformio --version
if errorlevel 1 (
    echo ERROR: PlatformIO not found!
    echo Please install: pip install platformio
    pause
    exit /b 1
)

echo.
echo Building project...
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
echo 1. Hold BOOT button on ESP32
echo 2. Press RESET button (keep holding BOOT)
echo 3. Release RESET button (keep holding BOOT)
echo 4. Press any key to start upload
echo 5. Release BOOT button when upload starts
echo.
pause

echo Uploading to ESP32...
python -m platformio run --target upload
if errorlevel 1 (
    echo.
    echo Upload failed! Trying different ports...
    echo.
    echo Trying COM5...
    python -m platformio run --target upload --upload-port COM5
    if errorlevel 1 (
        echo Trying COM6...
        python -m platformio run --target upload --upload-port COM6
        if errorlevel 1 (
            echo Trying COM7...
            python -m platformio run --target upload --upload-port COM7
            if errorlevel 1 (
                echo.
                echo Upload failed on all ports!
                echo Please check:
                echo 1. ESP32 is connected via USB
                echo 2. CP2102 driver is installed
                echo 3. ESP32 is in boot mode
                pause
                exit /b 1
            )
        )
    )
)

echo.
echo ========================================
echo Upload successful! 
echo ========================================
echo.
echo Starting Serial Monitor...
echo Press Ctrl+C to exit monitor
echo.
python -m platformio device monitor --baud 115200

pause