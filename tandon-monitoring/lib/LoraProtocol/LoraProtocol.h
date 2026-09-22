#pragma once
#include <Arduino.h>

#ifdef DEVICE_ROLE_NODE
#include "../SensorCore/SensorManager.h"
#endif

#ifdef DEVICE_ROLE_GATEWAY
#include "WaterQualityAI.h"
#endif

namespace LoraProtocol {

#ifdef DEVICE_ROLE_NODE
  // NODE -> GATEWAY: encode data sensor menjadi payload LoRa standar:
  // "GETARAN:x,AIR:x.x,TURBID:x,PH:x.xx,SUHU:x.x,HUM:x.x" (+ ACC/GYRO jika MPU online)
  // Catatan: AI tidak disertakan karena inferensi dilakukan di Gateway.
  String encode(const SensorManager &sensors);
#endif

  // GATEWAY: ambil 1 field tertentu dari payload berdasarkan key,
  // contoh: extractField(data, "PH:") -> "7.10"
  String extractField(const String &data, const String &key);

  // GATEWAY: ambil field dengan dukungan alias (misal "AIR:" atau "WATER_LEVEL:")
  String extractFieldWithFallback(const String &data, const String &primaryKey, const String &fallbackKey = "");

#ifdef DEVICE_ROLE_GATEWAY
  // GATEWAY: Bangun JSON yang 100% kompatibel dengan Firebase & Website-monitoring:
  // {
  //   "getaran": 0,
  //   "ketinggian_air": 150.5,
  //   "turbidity": 10,
  //   "ph": 7.05,
  //   "suhu": 28.2,
  //   "kelembapan": 65.4,
  //   "rssi": -45,
  //   "snr": 9.25,
  //   "ai_status": "Normal",
  //   "ai_confidence": 98.2,
  //   "ai_diagnosis": "Kualitas air aman, operasional optimal"
  // }
  String buildFirebaseJson(float waterLevel, int turbidity, float ph,
                           float temperature, float humidity, unsigned long vibration,
                           int rssi, float snr, const AIResult &ai,
                           const String &nodeId = "");

#endif

  // Konversi generic payload ke JSON jika dibutuhkan
  String toJson(const String &payload);
  String injectNumericField(String json, const String &key, const String &value);
  String injectStringField(String json, const String &key, const String &value);
}
