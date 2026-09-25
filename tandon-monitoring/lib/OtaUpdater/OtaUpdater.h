#pragma once
#include <Arduino.h>

namespace OtaUpdater {
  void begin();
  void checkForUpdate();
  bool isFuotaBusy();
  // Laporkan hasil update sebelumnya yang terpotong reboot (panggil setelah WiFi up).
  void reportPendingAfterReboot();
}
