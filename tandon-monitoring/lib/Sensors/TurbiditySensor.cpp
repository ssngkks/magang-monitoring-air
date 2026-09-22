#include "TurbiditySensor.h"

#define ADC_MAX_VALUE 4095.0f
#define ADC_VREF      3.3f

TurbiditySensor::TurbiditySensor(uint8_t pin, float clearVoltage, float muddyVoltage)
  : pin_(pin), clearV_(clearVoltage), muddyV_(muddyVoltage) {}

bool TurbiditySensor::begin() {
  return true; // pin analog ESP32 tidak perlu pinMode khusus
}

bool TurbiditySensor::read(SensorReading &out) {
  // Oversampling 10x untuk meredam noise ADC ESP32
  long sumRaw = 0;
  for (int i = 0; i < 10; i++) {
    sumRaw += analogRead(pin_);
    delay(2);
  }
  float raw = sumRaw / 10.0f;
  float voltage = (raw / ADC_MAX_VALUE) * ADC_VREF;

  float ntu;
  if (voltage >= clearV_) {
    ntu = 0;
  } else if (voltage <= muddyV_) {
    ntu = 100;
  } else {
    ntu = ((clearV_ - voltage) / (clearV_ - muddyV_)) * 100.0f;
  }

  out.values[0] = constrain(ntu, 0.0f, 100.0f);
  out.count = 1;
  return true;
}
