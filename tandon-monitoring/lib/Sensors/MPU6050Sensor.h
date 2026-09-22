#pragma once
#include "../SensorCore/ISensor.h"

// Driver ringan MPU6050 pakai raw I2C register (tanpa dependency
// library tambahan). Kalau kalian mau lebih lengkap (filter, DMP,
// dsb) tinggal ganti isi .cpp ini dengan library Adafruit_MPU6050,
// interface ISensor-nya tidak perlu berubah.
class MPU6050Sensor : public ISensor {
public:
  explicit MPU6050Sensor(uint8_t i2cAddress = 0x68);
  bool begin() override;
  bool read(SensorReading &out) override;
  const char* id() const override { return "MPU"; }
  const char* name() const override { return "MPU6050 (Accel/Gyro)"; }
  const char* valueSuffix(uint8_t index) const override;

private:
  uint8_t addr_;
  bool writeRegister(uint8_t reg, uint8_t value);
  bool readRegisters(uint8_t startReg, uint8_t *buffer, uint8_t length);
};
