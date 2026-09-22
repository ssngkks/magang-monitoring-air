#pragma once
#include <Arduino.h>

namespace FirebaseClient {
  // Update real-time, dipanggil tiap paket LoRa diterima
  void sendLatest(const String &jsonPayload);

  // Log history, dipanggil periodik / saat ada kondisi alert
  void sendHistory(const String &jsonPayload);

  // Baca nilai command dari RTDB: /commands/{kode_node}/{key}
  // Kembalikan string kosong jika tidak ada / null
  String readCommand(const String &kodeNode, const String &key);

  // Hapus/reset command setelah diproses (set ke null)
  void clearCommand(const String &kodeNode, const String &key);

  // Update status OTA ke RTDB: /ota/{kode_node}
  void updateOtaStatus(const String &kodeNode, const String &status, int progress = 0, const String &error = "");
}
