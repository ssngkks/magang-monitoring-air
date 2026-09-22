#pragma once
#include "../SensorCore/ISensor.h"
#include <DHT.h>

class DHTSensor : public ISensor {
public:
  DHTSensor(uint8_t pin, uint8_t type);
  bool begin() override;
  bool read(SensorReading &out) override;
  const char* id() const override { return "DHT"; }
  const char* name() const override { return "DHT22 (Suhu/Kelembapan)"; }
  const char* valueSuffix(uint8_t index) const override;

private:
  DHT dht_;
};
