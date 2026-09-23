#pragma once
#include <Arduino.h>

// ---------------------------------------------------------------------------
// Klien HTTP ke Laravel lokal (nama historis "FirebaseClient" dipertahankan
// agar include di seluruh firmware tak perlu diubah; isinya 100% Laravel).
// Auth: header X-Device-Key = DEVICE_KEY (audit.md §7). X-API-KEY dikirim juga
// untuk kompatibilitas server lama.
// ---------------------------------------------------------------------------
namespace FirebaseClient {
  // POST /api/sensor/store — dipanggil tiap paket LoRa diterima
  void sendLatest(const String &jsonPayload);

  // No-op by design: /api/sensor/store SUDAH menyimpan tiap bacaan ke tabel
  // riwayat sensor_data, jadi pemanggilan kedua hanya menduplikasi data.
  void sendHistory(const String &jsonPayload);

  // POST /api/devices/hello — SEKALI saat boot & WiFi connect (audit.md §5.1).
  // deviceRole: "node" | "gateway". capabilities: CSV, cth "ph,turbidity,...,mpu6050".
  // Kembalikan true bila server menjawab 200 (active) atau 202 (pending).
  bool sendHello(const String &deviceId, const String &deviceRole,
                 const String &firmwareVersion, const String &capabilitiesCsv);

  // POST /api/devices/heartbeat — tiap ±15 detik (audit.md §5.6).
  // Hanya menyentuh last_seen_at; tak mengubah status registrasi.
  bool sendHeartbeat(const String &deviceId);

  // CATATAN: readCommand/clearCommand era Firebase DIHAPUS (stub no-op dihapus).
  // Pemicu OTA instan kini via polling manifest Laravel tiap 60 detik (OtaUpdater).

  // POST /api/firmware/ota/status — lapor progres OTA gateway/FUOTA.
  // version opsional: bila diisi, server sinkronkan nodes.firmware_version.
  // otaId opsional: nomor job dari manifest — bila diisi, server menutup BARIS
  // TEPAT itu (tanpa ini, antrean dua versi bisa saling menutup).
  void updateOtaStatus(const String &kodeNode, const String &status, int progress = 0, const String &error = "", const String &version = "", long otaId = 0);
}
