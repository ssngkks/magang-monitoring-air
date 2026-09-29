#pragma once
#include <Arduino.h>

#if defined(DEVICE_ROLE_NODE)
#include "LoraFuota.h"

enum FuotaNodeState {

  FUOTA_NODE_IDLE,
  FUOTA_NODE_RECEIVING,
  FUOTA_NODE_COMPLETED,
  FUOTA_NODE_ERROR
};

class LoraFuotaNode {
public:
  LoraFuotaNode(const String &nodeId);

  // Inisialisasi
  void begin();

  // Kembalikan true jika proses FUOTA sedang aktif (Node harus pause kirim sensor)
  bool isUpdating() const { return state == FUOTA_NODE_RECEIVING; }

  // Proses paket LoRa yang baru diterima
  // Return true jika paket adalah FUOTA packet yang diproses
  bool processPacket(int packetSize);

  // Versi firmware yang sedang berjalan (di-set dari main setup).
  // Dipakai menolak ANNOUNCE versi sama agar tidak flash ulang.
  void setRunningVersion(const String &ver) { runningVersion = ver; }

  // Loop tick untuk menangani timeout jika transmisi terputus di tengah jalan
  void tick();

  FuotaNodeState getState() const { return state; }
  uint16_t getCurrentChunk() const { return expectedChunkSeq; }
  uint16_t getTotalChunks() const { return totalChunks; }

private:
  String myNodeId;
  FuotaNodeState state;

  uint32_t firmwareSize;
  uint16_t totalChunks;
  uint16_t expectedChunkSeq;
  String newVersion;
  String runningVersion;
  // Blueprint §3.1/§3.4: state keamanan FUOTA — nonce ANNOUNCE terakhir yang
  // diterima (anti-replay) + signature Ed25519 yang diumumkan gateway.
  // SHA-256 dihitung inkremental per chunk agar COMPLETE bisa verifikasi
  // signature SEBELUM Update.end(true) (jangan percaya gateway saja).
  uint32_t lastAnnounceNonce;
  uint8_t expectedSig[64];
  bool hasExpectedSig;
  void *shaCtx; // mbedtls_sha256_context dialokasikan saat ANNOUNCE diterima

  unsigned long lastActivityTime;
  static const unsigned long FUOTA_TIMEOUT_MS = 60000; // 60 detik timeout jika terputus

  void sendAck(uint8_t ackedCmd, uint16_t seq, uint8_t status);
  void sendNack(uint8_t ackedCmd, uint16_t seq, uint8_t errorStatus);
  void sendStatus(uint16_t currentExpectedSeq);
  void abortOta(const char *reason);
};
#endif

