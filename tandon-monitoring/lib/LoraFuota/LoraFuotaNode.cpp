#if defined(DEVICE_ROLE_NODE)
#include "LoraFuotaNode.h"
#include <LoRa.h>
#include <Update.h>
#include <Preferences.h>
#include "LoraSecure.h"
#ifdef FEATURE_OTA_SIGNING
#include "FirmwareVerify.h"
#include "firmware_signing_key.h"
#include "mbedtls/sha256.h"
#endif

#ifndef LORA_AUTH_KEY
#define LORA_AUTH_KEY "lora-secret-key-32-bytes-auth!"
#endif

LoraFuotaNode::LoraFuotaNode(const String &nodeId)
  : myNodeId(nodeId),
    state(FUOTA_NODE_IDLE),
    firmwareSize(0),
    totalChunks(0),
    expectedChunkSeq(0),
    newVersion(""),
    lastAnnounceNonce(0),
    hasExpectedSig(false),
    shaCtx(nullptr),
    lastActivityTime(0) {
  memset(expectedSig, 0, sizeof(expectedSig));
}

void LoraFuotaNode::begin() {
  state = FUOTA_NODE_IDLE;
  expectedChunkSeq = 0;
  totalChunks = 0;
  firmwareSize = 0;
  hasExpectedSig = false;
  // Muat nonce ANNOUNCE terakhir dari NVS agar replay lama tetap ditolak
  // meski node sempat reboot (blueprint §3.1 anti-replay).
  Preferences p;
  if (p.begin("lora_rx", true)) {
    lastAnnounceNonce = p.getUInt("last_ann", 0);
    p.end();
  }
}

void LoraFuotaNode::sendAck(uint8_t ackedCmd, uint16_t seq, uint8_t status) {
  delay(10); // Small pause to let gateway transition to RX
  LoRa.beginPacket();
  LoRa.write(FUOTA_MAGIC_0);
  LoRa.write(FUOTA_MAGIC_1);
  LoRa.write(FUOTA_CMD_ACK);
  LoRa.write(ackedCmd);
  LoRa.write((uint8_t)(seq & 0xFF));
  LoRa.write((uint8_t)((seq >> 8) & 0xFF));
  LoRa.write(status);
  LoRa.endPacket();
}

void LoraFuotaNode::sendNack(uint8_t ackedCmd, uint16_t seq, uint8_t errorStatus) {
  delay(10);
  LoRa.beginPacket();
  LoRa.write(FUOTA_MAGIC_0);
  LoRa.write(FUOTA_MAGIC_1);
  LoRa.write(FUOTA_CMD_NACK);
  LoRa.write(ackedCmd);
  LoRa.write((uint8_t)(seq & 0xFF));
  LoRa.write((uint8_t)((seq >> 8) & 0xFF));
  LoRa.write(errorStatus);
  LoRa.endPacket();
}

void LoraFuotaNode::sendStatus(uint16_t currentExpectedSeq) {
  delay(10);
  LoRa.beginPacket();
  LoRa.write(FUOTA_MAGIC_0);
  LoRa.write(FUOTA_MAGIC_1);
  LoRa.write(FUOTA_CMD_STATUS);
  LoRa.write((uint8_t)(currentExpectedSeq & 0xFF));
  LoRa.write((uint8_t)((currentExpectedSeq >> 8) & 0xFF));
  LoRa.write((uint8_t)state);
  LoRa.endPacket();
}

void LoraFuotaNode::abortOta(const char *reason) {
  Serial.print("[FUOTA Node] ABORT OTA: ");
  Serial.println(reason);
  if (Update.isRunning()) {
    Update.abort();
  }
#ifdef FEATURE_OTA_SIGNING
  if (shaCtx) {
    mbedtls_sha256_free((mbedtls_sha256_context*)shaCtx);
    delete (mbedtls_sha256_context*)shaCtx;
    shaCtx = nullptr;
  }
#else
  shaCtx = nullptr;
#endif
  hasExpectedSig = false;
  state = FUOTA_NODE_IDLE;
  expectedChunkSeq = 0;
}

bool LoraFuotaNode::processPacket(int packetSize) {
  if (packetSize < 3) return false;

  uint8_t magic0 = LoRa.read();
  uint8_t magic1 = LoRa.read();
  if (magic0 != FUOTA_MAGIC_0 || magic1 != FUOTA_MAGIC_1) {
    return false;
  }

  uint8_t cmd = LoRa.read();
  lastActivityTime = millis();

  switch (cmd) {
    case FUOTA_CMD_ANNOUNCE: {
      if (packetSize < 12) return true;

      uint32_t size = 0;
      size |= (uint32_t)LoRa.read();
      size |= ((uint32_t)LoRa.read()) << 8;
      size |= ((uint32_t)LoRa.read()) << 16;
      size |= ((uint32_t)LoRa.read()) << 24;

      uint16_t chunks = 0;
      chunks |= (uint16_t)LoRa.read();
      chunks |= ((uint16_t)LoRa.read()) << 8;

      uint16_t chunkSize = 0;
      chunkSize |= (uint16_t)LoRa.read();
      chunkSize |= ((uint16_t)LoRa.read()) << 8;

      uint8_t targetLen = LoRa.read();
      String targetNode = "";
      for (uint8_t i = 0; i < targetLen && LoRa.available(); i++) {
        targetNode += (char)LoRa.read();
      }

      uint8_t verLen = LoRa.read();
      String version = "";
      for (uint8_t i = 0; i < verLen && LoRa.available(); i++) {
        version += (char)LoRa.read();
      }

      // Verifikasi apakah target adalah node ini (atau wildcard "*")
      if (targetNode != "*" && targetNode != myNodeId) {
        Serial.printf("[FUOTA Node] Abaikan announce: target '%s' bukan untuk node '%s'\n",
                      targetNode.c_str(), myNodeId.c_str());
        return true;
      }

      // Penjaga anti-flash-ulang: tolak versi yang sudah berjalan (banding longgar,
      // "v1.0.2" dianggap sama dengan "1.0.2"). Node tetap IDLE, flash tidak tersentuh.
      {
        String offered = version;
        String running = runningVersion;
        offered.trim();
        running.trim();
        if (offered.startsWith("v") || offered.startsWith("V")) offered = offered.substring(1);
        if (running.startsWith("v") || running.startsWith("V")) running = running.substring(1);
        if (running.length() > 0 && offered == running) {
          Serial.printf("[FUOTA Node] Versi %s sudah berjalan. Tolak tanpa flash ulang.\n",
                        version.c_str());
          sendNack(FUOTA_CMD_ANNOUNCE, 0, FUOTA_STATUS_ALREADY_LATEST);
          return true;
        }
      }

      // --- Verifikasi ANNOUNCE (di-gate compile-time, blueprint susulan) ---
      // Mode secure (FEATURE_LORA_AUTH / FEATURE_OTA_SIGNING nyala): ANNOUNCE
      // wajib tervalidasi HMAC + nonce + signature SEBELUM terima chunk.
      // Mode default: terima ANNOUNCE legacy/extension apa adanya (perilaku
      // pra-hardening, hanya cek SHA/CRC per chunk) — kode HMAC/Ed25519 tidak
      // ikut ter-compile (hemat flash).
      bool isLegacy = (LoRa.available() == 0);
      uint32_t annNonce = 0;
      hasExpectedSig = false;
#ifdef FEATURE_LORA_AUTH
      if (!isLegacy) {
        if (!LoRa.available()) { sendNack(FUOTA_CMD_ANNOUNCE, 0, FUOTA_STATUS_AUTH_FAIL); return true; }
        uint8_t protoVer = LoRa.read();
        if (protoVer != FUOTA_PROTO_V1_SECURED) {
          Serial.printf("[FUOTA Node] DITOLAK: proto FUOTA tak dikenal 0x%02X\n", protoVer);
          sendNack(FUOTA_CMD_ANNOUNCE, 0, FUOTA_STATUS_AUTH_FAIL);
          return true;
        }
        if (LoRa.available() < 4 + 8 + 1) {
          Serial.println("[FUOTA Node] DITOLAK: ANNOUNCE secured terpotong.");
          sendNack(FUOTA_CMD_ANNOUNCE, 0, FUOTA_STATUS_AUTH_FAIL);
          return true;
        }
        annNonce = 0;
        annNonce |= (uint32_t)LoRa.read();
        annNonce |= ((uint32_t)LoRa.read()) << 8;
        annNonce |= ((uint32_t)LoRa.read()) << 16;
        annNonce |= ((uint32_t)LoRa.read()) << 24;
        uint8_t recvHmac[8];
        for (int i = 0; i < 8; i++) recvHmac[i] = LoRa.read();
        uint8_t sigLen = LoRa.available() ? LoRa.read() : 0;
        uint8_t recvSig[64] = {0};
        if (sigLen == 64) {
          if (LoRa.available() < 64) {
            Serial.println("[FUOTA Node] DITOLAK: signature terpotong.");
            sendNack(FUOTA_CMD_ANNOUNCE, 0, FUOTA_STATUS_SIG_FAIL);
            return true;
          }
          for (int i = 0; i < 64; i++) recvSig[i] = LoRa.read();
        } else if (sigLen != 0) {
          Serial.println("[FUOTA Node] DITOLAK: panjang signature aneh.");
          sendNack(FUOTA_CMD_ANNOUNCE, 0, FUOTA_STATUS_SIG_FAIL);
          return true;
        }
        // Verifikasi HMAC (kunci provisioning; jalur turunan per-device siap
        // di LoraSecure::effectiveKey untuk aktivasi armada berikutnya).
        String loraKey = String(LORA_AUTH_KEY);
        String expectHex = LoraSecure::fuotaAnnounceHmac(size, chunks, annNonce, targetNode, version, loraKey);
        uint8_t expectRaw[8] = {0};
        for (int i = 0; i < 8 && expectHex.length() == 16; i++) {
          expectRaw[i] = (uint8_t)strtoul(expectHex.substring(i * 2, i * 2 + 2).c_str(), nullptr, 16);
        }
        uint8_t diff = 0;
        for (int i = 0; i < 8; i++) diff |= (recvHmac[i] ^ expectRaw[i]);
        if (diff != 0) {
          Serial.println("[FUOTA Node] DITOLAK ANNOUNCE: HMAC tidak valid (kemungkinan pemalsu).");
          sendNack(FUOTA_CMD_ANNOUNCE, 0, FUOTA_STATUS_AUTH_FAIL);
          return true;
        }
        if (annNonce <= lastAnnounceNonce && lastAnnounceNonce != 0) {
          Serial.printf("[FUOTA Node] DITOLAK ANNOUNCE: replay (nonce %u <= terakhir %u).\n", annNonce, lastAnnounceNonce);
          sendNack(FUOTA_CMD_ANNOUNCE, 0, FUOTA_STATUS_AUTH_FAIL);
          return true;
        }
#ifdef FEATURE_OTA_SIGNING
        if (sigLen != 64) {
          // Secured v1 tanpa signature = tolak (checksum saja tak cukup).
          Serial.println("[FUOTA Node] DITOLAK ANNOUNCE: v1 wajib sertakan signature Ed25519.");
          sendNack(FUOTA_CMD_ANNOUNCE, 0, FUOTA_STATUS_SIG_FAIL);
          return true;
        }
        memcpy(expectedSig, recvSig, 64);
        hasExpectedSig = true;
#else
        // Secure-HMAC tapi signing mati: signature diabaikan (kompatibel
        // gateway default yang kirim sigLen=0). Lanjut dengan SHA/CRC saja.
        (void)recvSig;
        hasExpectedSig = false;
#endif
        lastAnnounceNonce = annNonce;
        Preferences pw;
        if (pw.begin("lora_rx", false)) { pw.putUInt("last_ann", lastAnnounceNonce); pw.end(); }
        Serial.printf("[FUOTA Node] ANNOUNCE secured VALID (nonce %u%s).\n", annNonce,
                      hasExpectedSig ? ", sig OK" : "");
      } else {
        Serial.println("[FUOTA Node] PERINGATAN: ANNOUNCE legacy tanpa HMAC/signature (masa transisi).");
        Serial.println("[FUOTA Node] Rilis berikutnya akan MENOLAK legacy. Segera update gateway.");
        hasExpectedSig = false;
      }
#else
      // Mode default: abaikan byte ekstensi bila ada (gateway secure), terima
      // seperti ANNOUNCE legacy pra-hardening.
      if (!isLegacy) {
        while (LoRa.available()) LoRa.read();
        Serial.println("[FUOTA Node] ANNOUNCE diterima (mode default, tanpa verifikasi HMAC/signature).");
      }
      (void)annNonce;
      hasExpectedSig = false;
#endif

      Serial.println("\n========================================");
      Serial.println("[FUOTA Node] ANNOUNCEMENT PEMBARUAN DITERIMA!");
      Serial.printf("[FUOTA Node] Versi: %s | Ukuran: %u bytes (%u chunks)\n",
                    version.c_str(), size, chunks);
      Serial.println("========================================");

      if (Update.isRunning()) {
        Update.abort();
      }
#ifdef FEATURE_OTA_SIGNING
      // Siapkan konteks SHA inkremental untuk verifikasi signature di COMPLETE.
      if (shaCtx) { mbedtls_sha256_free((mbedtls_sha256_context*)shaCtx); delete (mbedtls_sha256_context*)shaCtx; shaCtx = nullptr; }
      {
        mbedtls_sha256_context *ctx = new mbedtls_sha256_context;
        mbedtls_sha256_init(ctx);
        mbedtls_sha256_starts(ctx, 0);
        shaCtx = ctx;
      }
#else
      // Mode default: tanpa konteks SHA (hanya CRC16 per chunk, perilaku awal).
      shaCtx = nullptr;
#endif

      if (!Update.begin(size, U_FLASH)) {
        Serial.print("[FUOTA Node] GAGAL Update.begin(): ");
        Update.printError(Serial);
        sendNack(FUOTA_CMD_ANNOUNCE, 0, FUOTA_STATUS_FLASH_ERROR);
        state = FUOTA_NODE_IDLE;
        return true;
      }

      firmwareSize = size;
      totalChunks = chunks;
      expectedChunkSeq = 0;
      newVersion = version;
      state = FUOTA_NODE_RECEIVING;

      Serial.println("[FUOTA Node] Partisi OTA siap. Mengirim ACK ANNOUNCE...");
      sendAck(FUOTA_CMD_ANNOUNCE, 0, FUOTA_STATUS_OK);
      return true;
    }

    case FUOTA_CMD_CHUNK: {
      if (state != FUOTA_NODE_RECEIVING) {
        // Belum announce atau sudah selesai
        return true;
      }

      if (packetSize < 8) {
        Serial.println("[FUOTA Node] Paket CHUNK terlalu pendek!");
        sendNack(FUOTA_CMD_CHUNK, expectedChunkSeq, FUOTA_STATUS_SEQ_ERROR);
        return true;
      }

      uint16_t seq = 0;
      seq |= (uint16_t)LoRa.read();
      seq |= ((uint16_t)LoRa.read()) << 8;

      uint8_t chunkLen = LoRa.read();
      uint8_t payload[FUOTA_CHUNK_SIZE];
      for (uint8_t i = 0; i < chunkLen && LoRa.available(); i++) {
        payload[i] = LoRa.read();
      }

      uint16_t receivedCrc = 0;
      receivedCrc |= (uint16_t)LoRa.read();
      receivedCrc |= ((uint16_t)LoRa.read()) << 8;

      // Validasi panjang chunk (harus 192 byte, kecuali chunk terakhir)
      size_t expectedLen = FUOTA_CHUNK_SIZE;
      if (seq == totalChunks - 1 && (firmwareSize % FUOTA_CHUNK_SIZE) != 0) {
        expectedLen = firmwareSize % FUOTA_CHUNK_SIZE;
      }
      if (chunkLen != expectedLen) {
        Serial.printf("[FUOTA Node] TOLAK chunk %u: panjang tidak valid (%u byte, target %u byte)!\n",
                      seq, chunkLen, expectedLen);
        sendNack(FUOTA_CMD_CHUNK, seq, FUOTA_STATUS_LEN_ERROR);
        return true;
      }

      uint16_t calcCrc = LoraFuota::calculateCrc16(payload, chunkLen);
      if (calcCrc != receivedCrc) {
        Serial.printf("[FUOTA Node] CRC error chunk %u (calc: %04X, recv: %04X | RSSI: %d, SNR: %.1f)\n",
                      seq, calcCrc, receivedCrc, LoRa.packetRssi(), LoRa.packetSnr());
        sendNack(FUOTA_CMD_CHUNK, seq, FUOTA_STATUS_CRC_MISMATCH);
        return true;
      }

      if (seq == expectedChunkSeq) {
        size_t written = Update.write(payload, chunkLen);
        if (written != chunkLen) {
          Serial.printf("[FUOTA Node] GAGAL tulis chunk %u ke Flash OTA!\n", seq);
          sendNack(FUOTA_CMD_CHUNK, seq, FUOTA_STATUS_FLASH_ERROR);
          return true;
        }
        // Umpan SHA inkremental untuk verifikasi signature di COMPLETE
        // (mode secure saja; mode default hanya mengandalkan CRC16 per chunk).
#ifdef FEATURE_OTA_SIGNING
        if (shaCtx) mbedtls_sha256_update((mbedtls_sha256_context*)shaCtx, payload, chunkLen);
#endif

        expectedChunkSeq++;
        if (expectedChunkSeq % 20 == 0 || expectedChunkSeq == totalChunks) {
          Serial.printf("[FUOTA Node] Chunk %u/%u OK (%.1f%%) | RSSI: %d, SNR: %.1f dB\n",
                        expectedChunkSeq, totalChunks,
                        (float)expectedChunkSeq * 100.0f / totalChunks,
                        LoRa.packetRssi(), LoRa.packetSnr());
        }

        sendAck(FUOTA_CMD_CHUNK, seq, FUOTA_STATUS_OK);
      } else if (seq < expectedChunkSeq) {
        // Chunk duplikat lama yang sudah ditulis, kirim ACK ulang agar gateway lanjut
        Serial.printf("[FUOTA Node] Duplikat chunk %u diterima (posisi saat ini: %u). Kirim ulang ACK.\n",
                      seq, expectedChunkSeq);
        sendAck(FUOTA_CMD_CHUNK, seq, FUOTA_STATUS_OK);
      } else {
        // Ada chunk yang terlewat (seq > expectedChunkSeq)
        Serial.printf("[FUOTA Node] Out of order! Diterima %u, diharapkan %u\n",
                      seq, expectedChunkSeq);
        sendNack(FUOTA_CMD_CHUNK, seq, FUOTA_STATUS_SEQ_ERROR);
      }
      return true;
    }

    case FUOTA_CMD_QUERY: {
      Serial.printf("[FUOTA Node] QUERY status diterima dari Gateway. State: %d, ExpectedSeq: %u\n",
                    (int)state, expectedChunkSeq);
      sendStatus(expectedChunkSeq);
      return true;
    }

    case FUOTA_CMD_COMPLETE: {
      if (state != FUOTA_NODE_RECEIVING) return true;

      Serial.println("\n[FUOTA Node] Semua chunk diterima. Memvalidasi dan menyelesaikan update...");

      if (Update.progress() != firmwareSize) {
        Serial.printf("[FUOTA Node] Ukuran flash mismatch: tertulis %u dari target %u bytes!\n",
                      Update.progress(), firmwareSize);
        sendNack(FUOTA_CMD_COMPLETE, totalChunks, FUOTA_STATUS_SIZE_MISMATCH);
        abortOta("Size verification failed");
        return true;
      }

      // Verifikasi signature Ed25519 SENDIRI sebelum flash final
      // (mode secure saja; mode default: CRC16/size saja seperti awal).
#ifdef FEATURE_OTA_SIGNING
      if (hasExpectedSig && shaCtx) {
        uint8_t digest[32];
        // Salin konteks agar verify tidak merusak state bila perlu retry.
        mbedtls_sha256_context tmp = *((mbedtls_sha256_context*)shaCtx);
        mbedtls_sha256_finish(&tmp, digest);
        mbedtls_sha256_free(&tmp);
        if (!FirmwareVerify::verifyDigest(digest, expectedSig, FIRMWARE_PUBLIC_KEY)) {
          Serial.println("[FUOTA Node] DITOLAK: signature Ed25519 TIDAK VALID. Flash dibatalkan.");
          sendNack(FUOTA_CMD_COMPLETE, totalChunks, FUOTA_STATUS_SIG_FAIL);
          abortOta("Signature verification failed");
          return true;
        }
        Serial.println("[FUOTA Node] Signature Ed25519 VALID. Lanjut finalisasi flash.");
      } else if (!hasExpectedSig) {
        // Masa transisi legacy (ANNOUNCE tanpa signature): izinkan dengan
        // peringatan keras agar armada lama tidak brick, tapi catat jelas.
        Serial.println("[FUOTA Node] PERINGATAN: COMPLETE tanpa signature (legacy). Diterima sementara.");
        Serial.println("[FUOTA Node] Rilis berikutnya akan MENOLAK tanpa signature.");
      }
      if (shaCtx) {
        mbedtls_sha256_free((mbedtls_sha256_context*)shaCtx);
        delete (mbedtls_sha256_context*)shaCtx;
        shaCtx = nullptr;
      }
#else
      // Mode default: lewati verifikasi signature (hemat flash, tanpa Crypto).
      (void)hasExpectedSig;
#endif

      if (Update.end(true)) {
        if (Update.isFinished()) {
          Serial.println("========================================");
          Serial.println("[FUOTA Node] UPDATE BERHASIL!");
          Serial.println("[FUOTA Node] Mengirim ACK SUCCESS & Restarting ESP32...");
          Serial.println("========================================");

          sendAck(FUOTA_CMD_COMPLETE, totalChunks, FUOTA_STATUS_OK);
          state = FUOTA_NODE_COMPLETED;
          delay(1200);
          ESP.restart();
          return true;
        }
      }

      Serial.print("[FUOTA Node] ERROR saat Update.end(): ");
      Update.printError(Serial);
      sendNack(FUOTA_CMD_COMPLETE, totalChunks, FUOTA_STATUS_FLASH_ERROR);
      abortOta("Finalize verification failed");
      return true;
    }

    case FUOTA_CMD_ABORT: {
      abortOta("Menerima perintah abort dari Gateway");
      return true;
    }

    default:
      break;
  }

  return false;
}

void LoraFuotaNode::tick() {
  if (state == FUOTA_NODE_RECEIVING) {
    if (millis() - lastActivityTime > FUOTA_TIMEOUT_MS) {
      abortOta("Timeout tidak ada transmisi chunk selama 60 detik");
    }
  }
}
#endif

