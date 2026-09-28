#pragma once
#include <Arduino.h>

// ============================================================
// LoraSecure — autentikasi & integritas link LoRa (blueprint §3.1)
// - HMAC-SHA256 dipotong 8 byte (hemat airtime) di atas payload CSV.
// - Nonce/counter uint32 monoton per pengirim → anti replay.
// - Byte versi protokol (VER:0 legacy plaintext, VER:1 secured) untuk migrasi.
// - Kunci: LORA_AUTH_KEY compile-time sebagai provisioning; bila NVS sudah
//   menyimpan token unik per-device (§3.3), kunci LoRa diturunkan dari token
//   itu (SHA256(token)[:32]) agar tiap unit beda tanpa flash ulang.
//   JANGAN commit kunci produksi ke repo — pakai secrets.h lokal (.gitignore).
// - Blueprint susulan simplify-crypto: seluruh kode HMAC di-gate dengan
//   compile-time flag FEATURE_LORA_AUTH (default MATI di env biasa, NYALA di
//   env *_secure). Mode default: appendAuth() kirim plain, verifyAndStrip()
//   terima semua sebagai legacy — kode mbedtls HMAC benar-benar tidak ikut
//   ter-compile (hemat flash), bukan sekadar `if` mati.
// ============================================================

namespace LoraSecure {

  static const uint8_t PROTO_V0_LEGACY = 0;
  static const uint8_t PROTO_V1_HMAC   = 1;

  // Kunci provisioning fallback bila macro belum didefinisikan di secrets.h.
#ifndef LORA_AUTH_KEY
#define LORA_AUTH_KEY "lora-secret-key-32-bytes-auth!"
#endif

  // Ambil kunci LoRa efektif: turunan per-device bila token unik tersedia,
  // kalau tidak pakai LORA_AUTH_KEY provisioning (masa transisi).
  // derivedOut diisi representasi yang dipakai (untuk debug, JANGAN di-log).
  String effectiveKey(const String &deviceToken);

  // Hitung HMAC-SHA256(payload || nonce) lalu potong 8 byte → hex 16 char.
  // Mengembalikan "" bila komputasi gagal.
  String hmacTrunc8(const String &payload, uint32_t nonce, const String &key);

  // Bungkus payload CSV polos menjadi CSV secured:
  // "<csv>,NONCE:<n>,HMAC:<16hex>,VER:1"
  String appendAuth(const String &csvPayload, uint32_t nonce, const String &key);

  enum VerifyResult {
    AUTH_OK_SECURED = 0,  // HMAC valid + nonce baru
    AUTH_OK_LEGACY  = 1,  // tanpa HMAC (perangkat lama, masa transisi)
    AUTH_FAIL_HMAC  = 2,  // HMAC ada tapi tidak cocok
    AUTH_FAIL_REPLAY = 3, // HMAC valid tapi nonce <= lastNonce (replay)
    AUTH_FAIL_FORMAT = 4, // format auth rusak
  };

  // Verifikasi paket CSV (in/out):
  // - Bila ada field HMAC: verifikasi HMAC + cek nonce > lastNonce.
  //   Sukses → strip field NONCE/HMAC/VER dari csvInOut, nonceOut = nonce paket.
  // - Bila tanpa HMAC: kembalikan AUTH_OK_LEGACY tanpa mengubah isi
  //   (pemanggil boleh terima dengan warning selama migrasi, tolak bila strict).
  VerifyResult verifyAndStrip(String &csvInOut, uint32_t &nonceOut,
                              uint32_t lastNonce, const String &key);

  // HMAC untuk paket biner FUOTA ANNOUNCE (blueprint §3.1):
  // HMAC8( sizeLE4 || chunksLE2 || nonceLE4 || target || version )
  // Dipakai gateway saat kirim ANNOUNCE, diverifikasi node SEBELUM terima chunk.
  String fuotaAnnounceHmac(uint32_t fwSize, uint16_t chunks, uint32_t nonce,
                           const String &target, const String &version,
                           const String &key);

  // Counter monoton tersimpan di NVS ("lora" namespace, key "nonce").
  // nextNonce() membaca, increment, simpan, kembalikan nilai baru.
  // Bila NVS belum ada, mulai dari random(0x10000000..).
  uint32_t nextNonce();
  uint32_t lastStoredNonce();
}
