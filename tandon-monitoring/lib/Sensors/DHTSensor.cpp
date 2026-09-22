#include "DHTSensor.h"

DHTSensor::DHTSensor(uint8_t pin, uint8_t type) : dht_(pin, type) {}

bool DHTSensor::begin() {
  dht_.begin();
  return true;
}

bool DHTSensor::read(SensorReading &out) {
  float t = dht_.readTemperature();
  float h = dht_.readHumidity();
  if (isnan(t) || isnan(h)) return false; // manager akan pakai nilai lama

  out.values[0] = t;
  out.values[1] = h;
  out.count = 2;
  return true;
}

const char* DHTSensor::valueSuffix(uint8_t index) const {
  static const char* labels[2] = {"T", "H"};
  return (index < 2) ? labels[index] : "";
}
