#if defined(DEVICE_ROLE_NODE)
#include "LoraFuotaNode.h"
#include <LoRa.h>
#include <Update.h>


LoraFuotaNode::LoraFuotaNode(const String &nodeId)
  : myNodeId(nodeId),
    state(FUOTA_NODE_IDLE),
    firmwareSize(0),
    totalChunks(0),
    expectedChunkSeq(0),
    newVersion(""),
    lastActivityTime(0) {}

void LoraFuotaNode::begin() {
  state = FUOTA_NODE_IDLE;
  expectedChunkSeq = 0;
  totalChunks = 0;
  firmwareSize = 0;
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

      Serial.println("\n========================================");
      Serial.println("[FUOTA Node] ANNOUNCEMENT PEMBARUAN DITERIMA!");
      Serial.printf("[FUOTA Node] Versi: %s | Ukuran: %u bytes (%u chunks)\n",
                    version.c_str(), size, chunks);
      Serial.println("========================================");

      if (Update.isRunning()) {
        Update.abort();
      }

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

