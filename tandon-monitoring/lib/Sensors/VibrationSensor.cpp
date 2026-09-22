#include "VibrationSensor.h"

VibrationSensor* VibrationSensor::instance_ = nullptr;

VibrationSensor::VibrationSensor(uint8_t pin, unsigned long windowMs, unsigned long debounceMs)
  : pin_(pin), windowMs_(windowMs), debounceMs_(debounceMs) {}

bool VibrationSensor::begin() {
  pinMode(pin_, INPUT_PULLUP);
  instance_ = this;
  attachInterrupt(digitalPinToInterrupt(pin_), isrTrampoline, CHANGE);
  windowStart_ = millis();
  return true;
}

void IRAM_ATTR VibrationSensor::isrTrampoline() {
  if (instance_) instance_->onPulse();
}

void IRAM_ATTR VibrationSensor::onPulse() {
  unsigned long now = millis();
  if (now - lastPulseMs_ > debounceMs_) {
    pulseCount_++;
    lastPulseMs_ = now;
  }
}

bool VibrationSensor::read(SensorReading &out) {
  unsigned long now = millis();
  if (now - windowStart_ >= windowMs_) {
    noInterrupts();
    lastCount_ = pulseCount_;
    pulseCount_ = 0;
    interrupts();
    windowStart_ = now;
  }
  out.values[0] = (float)lastCount_;
  out.count = 1;
  return true;
}
