#pragma once
#include "ISensor.h"

class SensorManager; // forward declare

// Factory function yang bikin instance driver untuk 1 alamat I2C tetap,
// contoh: []() -> ISensor* { return new MPU6050Sensor(0x68); }
typedef ISensor* (*SensorFactory)();

struct I2CDeviceEntry {
  uint8_t address;
  SensorFactory factory;
  const char* label;
};

// Daftar SEMUA sensor I2C yang "dikenal" project ini.
//
// CARA NAMBAH SENSOR I2C BARU (mis. BMP280, INA219, dst) SUPAYA
// BENERAN PLUG-AND-PLAY:
//   1. Tulis driver-nya sekali: class BaruSensor : public ISensor {...}
//      (taruh di lib/Sensors/, sama seperti MPU6050Sensor.h/.cpp)
//   2. Tambah SATU baris di KNOWN_I2C_DEVICES (I2CSensorRegistry.cpp)
//   3. Selesai. Setelah itu, colok sensornya ke bus I2C -> boot -> otomatis
//      kedetect & terdaftar. Tidak perlu sentuh main.cpp / LoraProtocol /
//      FirebaseClient lagi - toolchain lain sudah otomatis ikutan lewat
//      SensorManager::serializeAll().
//
// CATATAN JUJUR: ini otomatis untuk sensor I2C (tiap chip punya alamat unik
// di bus, jadi "identitasnya" bisa dibaca hardware). Untuk sensor ANALOG
// (nempel di pin ADC seperti pH/turbidity), secara fisik TIDAK ADA cara
// mendeteksi otomatis "ini sensor apa" - keduanya cuma keliatan sebagai
// tegangan di kaki pin. Untuk analog, best practice-nya: driver ditulis
// SEKALI per JENIS sensor baru, lalu unit tambahan dari jenis yang SAMA
// (misal pasang turbidity ke-2 di tandon lain) cukup tambah 1 baris
// konfigurasi pin+kalibrasi di node/main.cpp - tanpa class baru.
extern const I2CDeviceEntry KNOWN_I2C_DEVICES[];
extern const uint8_t KNOWN_I2C_DEVICES_COUNT;

// Scan bus I2C, cocokkan alamat yang merespon dengan KNOWN_I2C_DEVICES,
// lalu daftarkan otomatis ke SensorManager. Panggil sekali di setup(),
// setelah Wire.begin().
uint8_t autoDetectI2CSensors(SensorManager &manager);
