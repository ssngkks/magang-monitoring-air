#pragma once
#include "../SensorCore/ISensor.h"

class TurbiditySensor : public ISensor {
public:
  explicit TurbiditySensor(uint8_t pin,
                            float clearVoltage = 2.5f,
                            float muddyVoltage = 1.0f);
  bool begin() override;
  bool read(SensorReading &out) override;
  const char* id() const override { return "TURBID"; }
  const char* name() const override { return "Turbidity (Kekeruhan)"; }

private:
  uint8_t pin_;
  float clearV_, muddyV_;
};
