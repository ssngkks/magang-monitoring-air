#pragma once
#include "../SensorCore/ISensor.h"

class UltrasonicSensor : public ISensor {
public:
  UltrasonicSensor(uint8_t trigPin, uint8_t echoPin, float maxHeightCm = 200.0f);
  bool begin() override;
  bool read(SensorReading &out) override;
  const char* id() const override { return "AIR"; }
  const char* name() const override { return "Ultrasonic AJ-SR04M (Level Air)"; }

private:
  uint8_t trig_, echo_;
  float maxHeight_;
  float readDistanceCm();
};
