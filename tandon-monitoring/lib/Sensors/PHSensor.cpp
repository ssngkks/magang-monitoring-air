#include "PHSensor.h"

PHSensor::PHSensor(uint8_t pin, float adcNeutral, float slopeAcid, float slopeBase)
  : pin_(pin), adcNeutral_(adcNeutral), slopeAcid_(slopeAcid), slopeBase_(slopeBase) {}

bool PHSensor::begin() {
  pinMode(pin_, INPUT);
  return true;
}

float PHSensor::calculatePH(int adc, float neutral, float slopeAcid, float slopeBase) {
  float nilaiPH;

  if (adc >= neutral) {
    // Sisi ASAM: ADC makin besar -> pH makin kecil (makin asam)
    nilaiPH = 7.00f - ((adc - neutral) / slopeAcid);
  } else {
    // Sisi BASA: ADC makin kecil -> pH makin besar (makin basa)
    nilaiPH = 7.00f + ((neutral - adc) / slopeBase);
  }

  // Clamping agar nilai pH tidak pernah keluar dari rentang wajar (misal probe lepas)
  return constrain(nilaiPH, 0.0f, 14.0f);
}

bool PHSensor::read(SensorReading &out) {
  // Oversampling 10x untuk meredam fluktuasi ADC
  long sumRaw = 0;
  for (int i = 0; i < 10; i++) {
    sumRaw += analogRead(pin_);
    delay(2);
  }
  int avgAdc = (int)(sumRaw / 10.0f);
  float ph = calculatePH(avgAdc, adcNeutral_, slopeAcid_, slopeBase_);

  out.values[0] = ph;
  out.count = 1;
  return true;
}
