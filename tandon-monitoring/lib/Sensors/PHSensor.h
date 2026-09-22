#pragma once
#include "../SensorCore/ISensor.h"

class PHSensor : public ISensor {
public:
  // Kalibrasi pH - PH-4502C + ESP32 (GPIO 32)
  // Titik kalibrasi hasil ukur langsung dari Claude:
  //   pH 4.01 (asam)   -> ADC 1790 (slope 79.93)
  //   pH 7.00 (netral) -> ADC 1551
  //   pH 9.00 (basa)   -> ADC 1285 (slope 133.00)
  explicit PHSensor(uint8_t pin = 32,
                    float adcNeutral = 1551.0f,
                    float slopeAcid = 79.93f,
                    float slopeBase = 133.00f);

  bool begin() override;
  bool read(SensorReading &out) override;
  const char* id() const override { return "PH"; }
  const char* name() const override { return "PH-4502C (pH Air)"; }

  // Fungsi utilitas konversi ADC ke pH
  static float calculatePH(int adc, float neutral = 1551.0f, float slopeAcid = 79.93f, float slopeBase = 133.00f);

private:
  uint8_t pin_;
  float adcNeutral_;
  float slopeAcid_;
  float slopeBase_;
};
