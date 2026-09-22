#include "MPU6050Sensor.h"
#include <Wire.h>

#define MPU_REG_PWR_MGMT_1   0x6B
#define MPU_REG_ACCEL_XOUT_H 0x3B

MPU6050Sensor::MPU6050Sensor(uint8_t i2cAddress) : addr_(i2cAddress) {}

bool MPU6050Sensor::writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(addr_);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool MPU6050Sensor::readRegisters(uint8_t startReg, uint8_t *buffer, uint8_t length) {
  Wire.beginTransmission(addr_);
  Wire.write(startReg);
  if (Wire.endTransmission(false) != 0) return false;
  Wire.requestFrom((uint8_t)addr_, (uint8_t)length);
  if (Wire.available() < length) return false;
  for (uint8_t i = 0; i < length; i++) buffer[i] = Wire.read();
  return true;
}

bool MPU6050Sensor::begin() {
  // Bangunkan sensor dari sleep mode (default setelah power-on)
  return writeRegister(MPU_REG_PWR_MGMT_1, 0x00);
}

bool MPU6050Sensor::read(SensorReading &out) {
  uint8_t raw[14];
  if (!readRegisters(MPU_REG_ACCEL_XOUT_H, raw, 14)) return false;

  int16_t ax = (raw[0] << 8) | raw[1];
  int16_t ay = (raw[2] << 8) | raw[3];
  int16_t az = (raw[4] << 8) | raw[5];
  // raw[6], raw[7] = register suhu internal, sengaja dilewati
  int16_t gx = (raw[8] << 8)  | raw[9];
  int16_t gy = (raw[10] << 8) | raw[11];
  int16_t gz = (raw[12] << 8) | raw[13];

  // Skala default: accel +-2g -> 16384 LSB/g, gyro +-250dps -> 131 LSB/(deg/s)
  out.values[0] = ax / 16384.0f;
  out.values[1] = ay / 16384.0f;
  out.values[2] = az / 16384.0f;
  out.values[3] = gx / 131.0f;
  out.values[4] = gy / 131.0f;
  out.values[5] = gz / 131.0f;
  out.count = 6;
  return true;
}

const char* MPU6050Sensor::valueSuffix(uint8_t index) const {
  static const char* labels[6] = {"AX", "AY", "AZ", "GX", "GY", "GZ"};
  return (index < 6) ? labels[index] : "";
}
