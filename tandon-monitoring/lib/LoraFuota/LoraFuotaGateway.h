#pragma once
#include <Arduino.h>

#if defined(DEVICE_ROLE_GATEWAY)
#include <FS.h>
#include "LoraFuota.h"


enum FuotaGatewayState {
  FUOTA_GW_IDLE,
  FUOTA_GW_DOWNLOADING,
  FUOTA_GW_TRANSMITTING,
  FUOTA_GW_COMPLETED,
  FUOTA_GW_ERROR
};

class LoraFuotaGateway {
public:
  LoraFuotaGateway();

  void begin();

  // Memeriksa apakah ada proses FUOTA yang sedang berjalan
  bool isBusy() const { return state == FUOTA_GW_DOWNLOADING || state == FUOTA_GW_TRANSMITTING; }

  // Memulai proses FUOTA untuk target node tertentu
  // Return true jika seluruh proses berhasil.
  // otaId (dari manifest) diteruskan ke semua laporan status agar server
  // menutup baris job yang tepat.
  // expectedSignature: hex Ed25519 128 char dari manifest (blueprint §3.4).
  // Bila kosong → gateway TOLAK lanjut (jangan FUOTA-kan binary tak bertanda).
  bool startFuota(const String &targetNode, const String &fwUrl,
                  const String &version, uint32_t expectedSize,
                  const String &expectedChecksum, uint32_t otaId = 0,
                  const String &expectedSignature = "");

  FuotaGatewayState getState() const { return state; }
  uint16_t getCurrentChunk() const { return currentChunk; }
  uint16_t getTotalChunks() const { return totalChunks; }

private:
  FuotaGatewayState state;
  String currentTargetNode;
  String currentVersion;
  String currentChecksum;
  String currentSignature;
  uint32_t currentNonce;
  uint32_t totalFileSize;
  uint16_t totalChunks;
  uint16_t currentChunk;
  uint8_t lastNackStatus;
  uint32_t currentOtaId;

  // Satu pintu laporan status: selalu sertakan target + versi + otaId aktif.
  void reportOta(const String &status, int progress, const String &error = "");

  // expectedSignature wajib (blueprint §3.4): binary tanpa signature valid DITOLAK.
  bool downloadToSpiffs(const String &url, const String &targetNode, const String &expectedChecksum, const String &expectedSignature);
  // Return: 1 = node menerima, 2 = node sudah versi terbaru (tanpa flash), 0 = gagal
  // Mengirim ANNOUNCE secured v1 (HMAC8 + nonce + signature) dengan fallback
  // legacy bila node lama tidak merespons (masa transisi, dicatat di Serial).
  int sendAnnounce(const String &targetNode, const String &version, uint32_t size, uint16_t chunks);
  bool sendChunks(const String &targetNode);
  bool readChunk(File &file, uint16_t seq, uint8_t *payload, size_t &bytesRead);
  bool queryNodeStatus(const String &targetNode, uint16_t &remoteExpectedSeq);
  bool sendComplete(const String &targetNode);
  void sendAbort(const String &targetNode, const char *reason);

  bool waitForAck(uint8_t expectedCmd, uint16_t expectedSeq, unsigned long timeoutMs);
};
#endif

