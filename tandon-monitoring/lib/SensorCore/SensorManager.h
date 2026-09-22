#pragma once
#include "ISensor.h"

#define MAX_SENSORS 16

// Registry sensor. Semua sensor (analog/digital/I2C) didaftarkan ke
// sini sekali di setup(), setelah itu main.cpp cukup panggil readAll()
// / get(id) - tidak perlu tahu jenis sensornya apa.
class SensorManager {
public:
  bool add(ISensor* sensor);
  void beginAll();
  void readAll();

  SensorReading get(const char* id) const;
  bool isOnline(const char* id) const;
  void printStatus() const;

  // Serialize SEMUA sensor terdaftar jadi teks "ID:val,ID2:val2,...".
  // Ini yang bikin nambah sensor otomatis ikut terkirim ke LoRa/Firebase
  // tanpa harus edit LoraProtocol atau kode pengiriman.
  String serializeAll() const;

private:
  ISensor* sensors_[MAX_SENSORS];
  SensorReading lastGood_[MAX_SENSORS];
  bool online_[MAX_SENSORS];
  uint8_t count_ = 0;
};
