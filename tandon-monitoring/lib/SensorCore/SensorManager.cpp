#include "SensorManager.h"
#include <string.h>

bool SensorManager::add(ISensor* sensor) {
  if (count_ >= MAX_SENSORS || sensor == nullptr) return false;
  sensors_[count_] = sensor;
  lastGood_[count_] = SensorReading{{0,0,0,0,0,0}, 0};
  online_[count_] = false;
  count_++;
  return true;
}

void SensorManager::beginAll() {
  for (uint8_t i = 0; i < count_; i++) {
    bool ok = sensors_[i]->begin();
    online_[i] = ok;
    Serial.printf("SENSOR INIT : %-10s (%s) -> %s\n",
                   sensors_[i]->id(), sensors_[i]->name(),
                   ok ? "OK" : "GAGAL");
  }
}

void SensorManager::readAll() {
  for (uint8_t i = 0; i < count_; i++) {
    SensorReading r;
    if (sensors_[i]->read(r)) {
      lastGood_[i] = r;
      online_[i] = true;
    } else {
      // gagal baca kali ini -> tetap pakai nilai bagus terakhir,
      // tapi tandai offline biar kelihatan di printStatus()
      online_[i] = false;
    }
  }
}

SensorReading SensorManager::get(const char* id) const {
  for (uint8_t i = 0; i < count_; i++) {
    if (strcmp(sensors_[i]->id(), id) == 0) return lastGood_[i];
  }
  return SensorReading{{0,0,0,0,0,0}, 0};
}

bool SensorManager::isOnline(const char* id) const {
  for (uint8_t i = 0; i < count_; i++) {
    if (strcmp(sensors_[i]->id(), id) == 0) return online_[i];
  }
  return false;
}

void SensorManager::printStatus() const {
  for (uint8_t i = 0; i < count_; i++) {
    Serial.printf("  %-12s : %s\n", sensors_[i]->id(),
                   online_[i] ? "online" : "OFFLINE (pakai nilai lama)");
  }
}

String SensorManager::serializeAll() const {
  String out = "";
  for (uint8_t i = 0; i < count_; i++) {
    for (uint8_t v = 0; v < lastGood_[i].count; v++) {
      if (out.length() > 0) out += ",";
      out += sensors_[i]->id();
      const char* suffix = sensors_[i]->valueSuffix(v);
      if (suffix && suffix[0] != '\0') {
        out += "_";
        out += suffix;
      }
      out += ":";
      out += String(lastGood_[i].values[v], 2);
    }
  }
  return out;
}
