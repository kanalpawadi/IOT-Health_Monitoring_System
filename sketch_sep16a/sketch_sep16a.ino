#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

MAX30105 particleSensor;

// Sensor data buffers
uint32_t irBuffer[100];
uint32_t redBuffer[100];

int32_t bufferLength = 100;

int32_t spo2;
int8_t validSPO2;

int32_t heartRate;
int8_t validHeartRate;

void setup()
{
  Serial.begin(115200);

  // ESP8266 I2C
  // SDA = D2 (GPIO4)
  // SCL = D1 (GPIO5)
  Wire.begin(D2, D1);

  Serial.println();
  Serial.println("MAX30102 Test");
  Serial.println("----------------");

  // Start MAX30102
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST))
  {
    Serial.println("MAX30102 NOT FOUND!");
    Serial.println("Check wiring.");
    
    while (1)
    {
      delay(1000);
    }
  }

  Serial.println("MAX30102 detected!");

  // Configure sensor
  byte ledBrightness = 60;
  byte sampleAverage = 4;
  byte ledMode = 2;       // Red + IR
  byte sampleRate = 100;
  int pulseWidth = 411;
  int adcRange = 4096;

  particleSensor.setup(
    ledBrightness,
    sampleAverage,
    ledMode,
    sampleRate,
    pulseWidth,
    adcRange
  );

  Serial.println("Place your finger on the sensor.");
  Serial.println();
}

void loop()
{
  // Collect 100 samples
  for (byte i = 0; i < bufferLength; i++)
  {
    while (particleSensor.available() == false)
    {
      particleSensor.check();
    }

    redBuffer[i] = particleSensor.getRed();
    irBuffer[i] = particleSensor.getIR();

    particleSensor.nextSample();
  }

  // Calculate Heart Rate and SpO2
  maxim_heart_rate_and_oxygen_saturation(
    irBuffer,
    bufferLength,
    redBuffer,
    &spo2,
    &validSPO2,
    &heartRate,
    &validHeartRate
  );

  Serial.println("----------------");

  if (validHeartRate)
  {
    Serial.print("Heart Rate: ");
    Serial.print(heartRate);
    Serial.println(" BPM");
  }
  else
  {
    Serial.println("Heart Rate: Invalid");
  }

  if (validSPO2)
  {
    Serial.print("SpO2: ");
    Serial.print(spo2);
    Serial.println(" %");
  }
  else
  {
    Serial.println("SpO2: Invalid");
  }

  delay(1000);
}