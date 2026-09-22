#pragma once
#include <Arduino.h>

namespace OtaUpdater {
  void begin();
  void checkForUpdate();
  bool isFuotaBusy();
}
