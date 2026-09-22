#pragma once
#include <Arduino.h>

// Hasil bacaan satu sensor. Tidak semua sensor pakai semua slot -
// yang tidak dipakai tetap 0, "count" bilang berapa yang valid.
// values[6] cukup untuk sensor 6-axis (MPU6050 dkk); sensor lain
// biasanya cuma pakai 1-2 slot.
struct SensorReading {
  float values[6];
  uint8_t count;
};

// SEMUA driver sensor di project ini WAJIB implement interface ini.
// SensorManager cuma pernah "ngomong" ke sensor lewat interface ini,
// jadi nambah sensor jenis baru = bikin 1 class baru yang implement
// ISensor - tidak pernah nyenggol main.cpp atau sensor lain.
class ISensor {
public:
  virtual ~ISensor() {}

  // Dipanggil sekali dari setup(). Return false kalau sensor gagal
  // init (misal secara fisik belum terpasang) - SensorManager akan
  // menandai sensor ini offline tapi program tetap jalan normal.
  virtual bool begin() = 0;

  // Dipanggil tiap siklus baca. Return false kalau bacaan gagal/tidak
  // valid (SensorManager akan tetap pakai nilai bagus terakhir,
  // bukan nilai sampah/nol).
  virtual bool read(SensorReading &out) = 0;

  // ID pendek unik, dipakai sebagai key di payload LoRa / JSON,
  // misal "PH", "TURBID", "MPU". Harus unik di seluruh sensor.
  virtual const char* id() const = 0;

  // Nama manusiawi buat log serial.
  virtual const char* name() const = 0;

  // Suffix untuk value ke-`index`, dipakai kalau 1 sensor punya lebih
  // dari 1 nilai (DHT -> "T","H"; MPU6050 -> "AX".."GZ"). Sensor
  // dengan 1 nilai boleh biarkan default (kosong).
  virtual const char* valueSuffix(uint8_t index) const { (void)index; return ""; }
};
