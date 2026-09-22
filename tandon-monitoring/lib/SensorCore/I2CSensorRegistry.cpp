#include "I2CSensorRegistry.h"
#include "SensorManager.h"
#include "../Sensors/MPU6050Sensor.h"
#include <Wire.h>

static ISensor* makeMPU6050() { return new MPU6050Sensor(0x68); }

// >>> Daftar sensor I2C yang dikenal - tambah baris baru di sini <<<
const I2CDeviceEntry KNOWN_I2C_DEVICES[] = {
  { 0x68, makeMPU6050, "MPU6050 (Accel/Gyro)" },
  // { 0x76, makeBMP280, "BMP280 (Tekanan/Suhu)" },  <- contoh nambah sensor baru
};
const uint8_t KNOWN_I2C_DEVICES_COUNT =
    sizeof(KNOWN_I2C_DEVICES) / sizeof(KNOWN_I2C_DEVICES[0]);

uint8_t autoDetectI2CSensors(SensorManager &manager) {
  uint8_t found = 0;
  Serial.println("I2C SCAN : mencari sensor di bus I2C...");

  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() != 0) continue; // tidak ada device di alamat ini

    for (uint8_t i = 0; i < KNOWN_I2C_DEVICES_COUNT; i++) {
      if (KNOWN_I2C_DEVICES[i].address == addr) {
        Serial.printf("  -> Ditemukan %s di alamat 0x%02X, mendaftarkan...\n",
                       KNOWN_I2C_DEVICES[i].label, addr);
        ISensor* sensor = KNOWN_I2C_DEVICES[i].factory();
        if (manager.add(sensor)) found++;
        break;
      }
    }
  }

  Serial.printf("I2C SCAN : selesai, %d sensor terdaftar otomatis.\n", found);
  return found;
}
