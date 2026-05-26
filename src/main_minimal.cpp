#include <Arduino.h>

// Code tối thiểu để test upload
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("ESP32 Started!");
    Serial.println("Upload successful!");
}

void loop() {
    Serial.println("Running...");
    delay(1000);
}
