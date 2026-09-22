#pragma once
#include <Arduino.h>

namespace TelegramNotifier {
  // Kirim 1 pesan teks (support Markdown) ke bot & chat id di secrets.h
  void send(const String &message);
}
