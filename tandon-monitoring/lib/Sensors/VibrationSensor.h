#pragma once
#include "../SensorCore/ISensor.h"

class VibrationSensor : public ISensor {
public:
  explicit VibrationSensor(uint8_t pin,
                            unsigned long windowMs = 2000,
                            unsigned long debounceMs = 30);
  bool begin() override;
  bool read(SensorReading &out) override;
  const char* id() const override { return "GETARAN"; }
  const char* name() const override { return "Sensor Getaran Pompa"; }

  // dipanggil dari trampoline ISR global - jangan dipanggil manual
  void IRAM_ATTR onPulse();

private:
  uint8_t pin_;
  unsigned long windowMs_, debounceMs_;
  volatile unsigned long pulseCount_ = 0;
  volatile unsigned long lastPulseMs_ = 0;
  unsigned long windowStart_ = 0;
  unsigned long lastCount_ = 0;

  // ESP32 attachInterrupt butuh plain function pointer, bukan method
  // non-static. Karena cuma ada 1 sensor getaran, dipakai 1 instance
  // statis + trampoline sederhana ini.
  static VibrationSensor* instance_;
  static void IRAM_ATTR isrTrampoline();
};
