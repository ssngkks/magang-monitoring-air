#include "UltrasonicSensor.h"

UltrasonicSensor::UltrasonicSensor(uint8_t trigPin, uint8_t echoPin, float maxHeightCm)
  : trig_(trigPin), echo_(echoPin), maxHeight_(maxHeightCm) {}

bool UltrasonicSensor::begin() {
  pinMode(trig_, OUTPUT);
  pinMode(echo_, INPUT);
  digitalWrite(trig_, LOW);
  return true;
}

float UltrasonicSensor::readDistanceCm() {
  digitalWrite(trig_, LOW);
  delayMicroseconds(5);
  digitalWrite(trig_, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig_, LOW);

  // timeout ~25ms (~4.3m) biar CPU tidak tertahan kalau tidak ada pantulan
  unsigned long duration = pulseIn(echo_, HIGH, 25000UL);
  if (duration == 0) return -1;
  return duration * 0.0343f / 2.0f;
}

bool UltrasonicSensor::read(SensorReading &out) {
  float d = readDistanceCm();
  if (d < 0) return false;
  float level = constrain(maxHeight_ - d, 0.0f, maxHeight_);
  out.values[0] = level;
  out.count = 1;
  return true;
}
