#pragma once
#include <Arduino.h>

// ============================================================
// FirmwareVerify — verifikasi digital signature Ed25519 (blueprint §3.4)
// Backend menandatangani digest SHA-256 (32 byte) tiap binary firmware
// dengan private key (storage/app/keys, TIDAK di-commit). Firmware menyimpan
// public key 32 byte di include/firmware_signing_key.h dan WAJIB verifikasi
// SEBELUM apply update (WiFi OtaUpdater maupun LoRa FUOTA node).
// Implementasi memakai Arduino Cryptography Library (rweather/Crypto):
//   lib_deps += rweather/Crypto (lihat platformio.ini [env]).
// ============================================================

namespace FirmwareVerify {

  // Verifikasi signature (64 byte) atas digest SHA-256 mentah (32 byte).
  // pubKey 32 byte dari FIRMWARE_PUBLIC_KEY. Kembalikan true bila valid.
  bool verifyDigest(const uint8_t *digest32, const uint8_t *sig64, const uint8_t *pub32);

  // Helper hex: shaHex 64 char + sigHex 128 char → verifikasi.
  // pubHex opsional (64 char); bila kosong pakai FIRMWARE_PUBLIC_KEY.
  bool verifyDigestHex(const String &shaHex, const String &sigHex, const String &pubHex = "");

  // Hitung SHA-256 stream file yang sudah terbuka (dipakai gateway).
  // File harus sudah di-seek(0). Mengembalikan hex 64 char, "" bila gagal.
  String sha256HexOfStream(Stream &s, size_t len);

  // Konversi hex → bytes. Kembalikan jumlah byte tertulis, 0 bila format salah.
  size_t hexToBytes(const String &hex, uint8_t *out, size_t outLen);
}
