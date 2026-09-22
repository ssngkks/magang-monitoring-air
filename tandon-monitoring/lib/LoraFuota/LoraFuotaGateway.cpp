#if defined(DEVICE_ROLE_GATEWAY)
#include "LoraFuotaGateway.h"
#include <FS.h>
#include <LittleFS.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <LoRa.h>
#include <mbedtls/sha256.h>
#include "FirebaseClient.h"

static const char *FUOTA_TEMP_FILE = "/fuota_temp.bin";

LoraFuotaGateway::LoraFuotaGateway()
  : state(FUOTA_GW_IDLE),
    currentTargetNode(""),
    currentVersion(""),
    totalFileSize(0),
    totalChunks(0),
    currentChunk(0) {}

void LoraFuotaGateway::begin() {
  if (!LittleFS.begin(true)) {
    Serial.println("[FUOTA Gateway] GAGAL mount LittleFS!");
  } else {
    Serial.printf("[FUOTA Gateway] LittleFS siap: Total %u KB, Terpakai %u KB.\n",
                  (uint32_t)(LittleFS.totalBytes() / 1024),
                  (uint32_t)(LittleFS.usedBytes() / 1024));
  }
  state = FUOTA_GW_IDLE;
}


bool LoraFuotaGateway::waitForAck(uint8_t expectedCmd, uint16_t expectedSeq, unsigned long timeoutMs) {
  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    int packetSize = LoRa.parsePacket();
    if (packetSize >= 6) {
      uint8_t m0 = LoRa.read();
      uint8_t m1 = LoRa.read();
      if (m0 == FUOTA_MAGIC_0 && m1 == FUOTA_MAGIC_1) {
        uint8_t cmd = LoRa.read();
        if (cmd == FUOTA_CMD_ACK) {
          uint8_t ackedCmd = LoRa.read();
          uint16_t seq = 0;
          seq |= (uint16_t)LoRa.read();
          seq |= ((uint16_t)LoRa.read()) << 8;
          uint8_t status = LoRa.read();

          if (ackedCmd == expectedCmd && seq == expectedSeq && status == FUOTA_STATUS_OK) {
            return true;
          }
        } else if (cmd == FUOTA_CMD_NACK) {
          uint8_t ackedCmd = LoRa.read();
          uint16_t seq = 0;
          seq |= (uint16_t)LoRa.read();
          seq |= ((uint16_t)LoRa.read()) << 8;
          uint8_t status = LoRa.read();
          if (ackedCmd == expectedCmd) {
            Serial.printf("[FUOTA Gateway] NACK dari Node (cmd: 0x%02X, seq: %u, status: %d)!\n",
                          ackedCmd, seq, (int)status);
            return false; // Fast retry on explicit NACK
          }
        }
      } else {
        // Bukan FUOTA packet, buang sisa isi paket agar FIFO bersih
        while (LoRa.available()) LoRa.read();
      }
    }
    delay(5);
  }
  return false;
}

bool LoraFuotaGateway::downloadToSpiffs(const String &url, const String &targetNode, const String &expectedChecksum) {
  Serial.println("[FUOTA Gateway] Mengunduh binary firmware dari server ke LittleFS: " + url);
  FirebaseClient::updateOtaStatus(targetNode, "downloading", 10);

  // Hapus file lama jika ada
  if (LittleFS.exists(FUOTA_TEMP_FILE)) {
    LittleFS.remove(FUOTA_TEMP_FILE);
    delay(50);
  }

  // Parameter ketiga 'true' wajib di ESP32 Arduino v4+ agar file baru bisa dibuat
  File file = LittleFS.open(FUOTA_TEMP_FILE, FILE_WRITE, true);
  if (!file) {
    Serial.println("[FUOTA Gateway] GAGAL membuka file di LittleFS untuk penulisan!");
    FirebaseClient::updateOtaStatus(targetNode, "failed", 0, "Gagal membuat file binary di LittleFS Gateway");
    return false;
  }

  HTTPClient http;
  http.setTimeout(30000);

  WiFiClient plainClient;
  plainClient.setTimeout(30);
  WiFiClientSecure secureClient;
  secureClient.setInsecure();
  secureClient.setTimeout(30);

  bool isHttps = url.startsWith("https://");
  bool beginOk = isHttps ? http.begin(secureClient, url) : http.begin(plainClient, url);

  if (!beginOk) {
    file.close();
    Serial.println("[FUOTA Gateway] HTTP begin gagal!");
    FirebaseClient::updateOtaStatus(targetNode, "failed", 0, "Gagal koneksi HTTP ke server");
    return false;
  }

  int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    file.close();
    http.end();
    Serial.printf("[FUOTA Gateway] HTTP download gagal, kode: %d\n", httpCode);
    FirebaseClient::updateOtaStatus(targetNode, "failed", 0, "Download firmware HTTP error: " + String(httpCode));
    return false;
  }

  int expectedSize = http.getSize();
  int downloaded = http.writeToStream(&file);
  file.flush();
  file.close();
  http.end();

  if (downloaded <= 0) {
    Serial.printf("[FUOTA Gateway] GAGAL: Download firmware error (%d)\n", downloaded);
    FirebaseClient::updateOtaStatus(targetNode, "failed", 0, "Gagal mengunduh file binary ke LittleFS");
    return false;
  }

  // Verifikasi file yang benar-benar tersimpan di disk
  File verify = LittleFS.open(FUOTA_TEMP_FILE, FILE_READ);
  if (!verify) {
    Serial.println("[FUOTA Gateway] GAGAL: File firmware tidak dapat dibuka kembali dari LittleFS!");
    FirebaseClient::updateOtaStatus(targetNode, "failed", 0, "File firmware tidak dapat dibuka dari LittleFS");
    return false;
  }

  size_t actualSize = verify.size();
  Serial.printf("[FUOTA Gateway] Unduh selesai: diterima=%d, di disk=%u bytes.\n", downloaded, actualSize);

  if (actualSize < 10000) {
    verify.close();
    Serial.printf("[FUOTA Gateway] GAGAL: File di LittleFS terlalu kecil (%u bytes)! File tidak tersimpan dengan benar.\n", actualSize);
    FirebaseClient::updateOtaStatus(targetNode, "failed", 0, "File firmware gagal tersimpan ke LittleFS");
    return false;
  }

  if (expectedSize > 0 && (int)actualSize != expectedSize) {
    verify.close();
    Serial.printf("[FUOTA Gateway] GAGAL: Ukuran file tidak lengkap (%u dari target %d bytes)!\n",
                  actualSize, expectedSize);
    FirebaseClient::updateOtaStatus(targetNode, "failed", 0, "File firmware tidak lengkap di LittleFS");
    return false;
  }

  // Pre-verifikasi membaca seluruh isi file dari awal sampai akhir & hitung SHA256
  mbedtls_sha256_context sha_ctx;
  mbedtls_sha256_init(&sha_ctx);
  mbedtls_sha256_starts(&sha_ctx, 0); // 0 = SHA-256

  uint8_t chkBuf[256];
  size_t totalReadVerify = 0;
  while (verify.available()) {
    size_t r = verify.read(chkBuf, sizeof(chkBuf));
    if (r == 0) break;
    mbedtls_sha256_update(&sha_ctx, chkBuf, r);
    totalReadVerify += r;
  }
  verify.close();

  uint8_t shaOutput[32];
  mbedtls_sha256_finish(&sha_ctx, shaOutput);
  mbedtls_sha256_free(&sha_ctx);

  char hashStr[65];
  for (int i = 0; i < 32; i++) {
    sprintf(hashStr + (i * 2), "%02x", shaOutput[i]);
  }
  hashStr[64] = '\0';

  Serial.printf("[FUOTA Gateway] Integritas LittleFS: %u/%u bytes terverifikasi dapat dibaca.\n",
                totalReadVerify, actualSize);
  Serial.printf("[FUOTA Gateway] Hash SHA256 file: %s\n", hashStr);

  if (expectedChecksum.length() > 0) {
    String cleanExp = expectedChecksum;
    cleanExp.trim();
    cleanExp.toLowerCase();
    String cleanCalc = String(hashStr);
    cleanCalc.toLowerCase();

    if (cleanCalc != cleanExp) {
      Serial.printf("[FUOTA Gateway] PERINGATAN: SHA256 berbeda! Server: %s, Aktual: %s\n",
                    cleanExp.c_str(), cleanCalc.c_str());
    } else {
      Serial.println("[FUOTA Gateway] SHA256 VALID dan cocok 100% dengan server!");
    }
  }

  totalFileSize = actualSize;
  totalChunks = (totalFileSize + FUOTA_CHUNK_SIZE - 1) / FUOTA_CHUNK_SIZE;
  Serial.printf("[FUOTA Gateway] Total chunk LoRa yang akan dikirim: %u chunk\n", totalChunks);
  FirebaseClient::updateOtaStatus(targetNode, "downloading", 20);
  return true;
}


bool LoraFuotaGateway::sendAnnounce(const String &targetNode, const String &version, uint32_t size, uint16_t chunks) {
  Serial.println("[FUOTA Gateway] Mengirim pengumuman pembaruan (ANNOUNCE) ke Node: " + targetNode);

  for (int attempt = 1; attempt <= FUOTA_MAX_RETRIES; attempt++) {
    LoRa.beginPacket();
    LoRa.write(FUOTA_MAGIC_0);
    LoRa.write(FUOTA_MAGIC_1);
    LoRa.write(FUOTA_CMD_ANNOUNCE);

    // Size (4 bytes)
    LoRa.write((uint8_t)(size & 0xFF));
    LoRa.write((uint8_t)((size >> 8) & 0xFF));
    LoRa.write((uint8_t)((size >> 16) & 0xFF));
    LoRa.write((uint8_t)((size >> 24) & 0xFF));

    // Chunks count (2 bytes)
    LoRa.write((uint8_t)(chunks & 0xFF));
    LoRa.write((uint8_t)((chunks >> 8) & 0xFF));

    // Chunk size (2 bytes)
    uint16_t chunkSize = FUOTA_CHUNK_SIZE;
    LoRa.write((uint8_t)(chunkSize & 0xFF));
    LoRa.write((uint8_t)((chunkSize >> 8) & 0xFF));

    // Target Node ID
    LoRa.write((uint8_t)targetNode.length());
    for (size_t i = 0; i < targetNode.length(); i++) {
      LoRa.write((uint8_t)targetNode.charAt(i));
    }

    // Version
    LoRa.write((uint8_t)version.length());
    for (size_t i = 0; i < version.length(); i++) {
      LoRa.write((uint8_t)version.charAt(i));
    }

    LoRa.endPacket();

    Serial.printf("[FUOTA Gateway] ANNOUNCE terkirim (percobaan %d/%d). Menunggu ACK dari Node...\n",
                  attempt, FUOTA_MAX_RETRIES);

    if (waitForAck(FUOTA_CMD_ANNOUNCE, 0, 3000)) {
      Serial.println("[FUOTA Gateway] Node merespon ACK! Node siap menerima data firmware.");
      return true;
    }
    delay(500);
  }

  Serial.println("[FUOTA Gateway] GAGAL: Node tidak merespon ANNOUNCE.");
  return false;
}

bool LoraFuotaGateway::readChunk(File &file, uint16_t seq, uint8_t *payload, size_t &bytesRead) {
  uint32_t expectedPos = (uint32_t)seq * FUOTA_CHUNK_SIZE;
  size_t expectedLen = FUOTA_CHUNK_SIZE;
  if (expectedPos + expectedLen > totalFileSize) {
    expectedLen = totalFileSize - expectedPos;
  }

  // 1. Pastikan posisi file berada di expectedPos
  if (!file || file.position() != expectedPos) {
    if (!file || !file.seek(expectedPos, SeekSet)) {
      file.close();
      file = LittleFS.open(FUOTA_TEMP_FILE, FILE_READ);
      if (!file || !file.seek(expectedPos, SeekSet)) {
        return false;
      }
    }
  }

  // 2. Baca loop agar tepat 'expectedLen' bytes terisi (mengatasi batas blok VFS/LittleFS 4096 byte)
  bytesRead = 0;
  while (bytesRead < expectedLen && file.available()) {
    size_t n = file.read(payload + bytesRead, expectedLen - bytesRead);
    if (n == 0) {
      delay(1);
      n = file.read(payload + bytesRead, expectedLen - bytesRead);
      if (n == 0) break;
    }
    bytesRead += n;
  }

  // 3. Jika belum lengkap (misal di batas sektor), buka ulang file dari disk
  if (bytesRead != expectedLen) {
    file.close();
    file = LittleFS.open(FUOTA_TEMP_FILE, FILE_READ);
    if (file && file.seek(expectedPos, SeekSet)) {
      bytesRead = 0;
      while (bytesRead < expectedLen && file.available()) {
        size_t n = file.read(payload + bytesRead, expectedLen - bytesRead);
        if (n == 0) break;
        bytesRead += n;
      }
    }
  }

  return (bytesRead == expectedLen);
}

bool LoraFuotaGateway::queryNodeStatus(const String &targetNode, uint16_t &remoteExpectedSeq) {
  // Buang sisa RX buffer sebelum kirim query
  while (LoRa.parsePacket() > 0) {
    while (LoRa.available()) LoRa.read();
  }

  LoRa.beginPacket();
  LoRa.write(FUOTA_MAGIC_0);
  LoRa.write(FUOTA_MAGIC_1);
  LoRa.write(FUOTA_CMD_QUERY);
  LoRa.endPacket();

  unsigned long start = millis();
  while (millis() - start < 2500) {
    int packetSize = LoRa.parsePacket();
    if (packetSize >= 6) {
      uint8_t m0 = LoRa.read();
      uint8_t m1 = LoRa.read();
      if (m0 == FUOTA_MAGIC_0 && m1 == FUOTA_MAGIC_1) {
        uint8_t cmd = LoRa.read();
        if (cmd == FUOTA_CMD_STATUS) {
          uint16_t seq = 0;
          seq |= (uint16_t)LoRa.read();
          seq |= ((uint16_t)LoRa.read()) << 8;
          uint8_t nodeState = LoRa.read();
          remoteExpectedSeq = seq;
          return true;
        }
      } else {
        while (LoRa.available()) LoRa.read();
      }
    }
    delay(10);
  }
  return false;
}

bool LoraFuotaGateway::sendChunks(const String &targetNode) {
  File file = LittleFS.open(FUOTA_TEMP_FILE, FILE_READ);
  if (!file) {
    Serial.println("[FUOTA Gateway] GAGAL membuka file LittleFS untuk membaca chunk!");
    return false;
  }

  size_t actualSize = file.size();
  Serial.printf("[FUOTA Gateway] Membuka firmware di LittleFS: %u bytes (%u chunk total)\n",
                actualSize, totalChunks);

  uint8_t payload[FUOTA_CHUNK_SIZE];
  unsigned long lastFbUpdate = 0;
  int consecutiveResumeFailures = 0;

  for (uint16_t seq = 0; seq < totalChunks; seq++) {
    currentChunk = seq;

    size_t bytesRead = 0;
    if (!readChunk(file, seq, payload, bytesRead)) {
      Serial.printf("[FUOTA Gateway] GAGAL membaca chunk %u dari LittleFS!\n", seq);
      file.close();
      sendAbort(targetNode, "Gagal membaca binary LittleFS pada Gateway");
      return false;
    }

    uint16_t crc = LoraFuota::calculateCrc16(payload, bytesRead);
    bool chunkOk = false;

    for (int attempt = 1; attempt <= FUOTA_MAX_RETRIES; attempt++) {
      // DRAIN / BUANG SISA RX BUFFER sebelum transmisi baru
      while (LoRa.parsePacket() > 0) {
        while (LoRa.available()) LoRa.read();
      }

      LoRa.beginPacket();
      LoRa.write(FUOTA_MAGIC_0);
      LoRa.write(FUOTA_MAGIC_1);
      LoRa.write(FUOTA_CMD_CHUNK);
      LoRa.write((uint8_t)(seq & 0xFF));
      LoRa.write((uint8_t)((seq >> 8) & 0xFF));
      LoRa.write((uint8_t)bytesRead);
      LoRa.write(payload, bytesRead);
      LoRa.write((uint8_t)(crc & 0xFF));
      LoRa.write((uint8_t)((crc >> 8) & 0xFF));
      LoRa.endPacket();

      if (waitForAck(FUOTA_CMD_CHUNK, seq, FUOTA_ACK_TIMEOUT_MS)) {
        chunkOk = true;
        consecutiveResumeFailures = 0;
        break;
      }

      // Log detail saat retry: seq, attempt, RSSI, SNR
      Serial.printf("[FUOTA Gateway] Retry chunk %u (percobaan %d/%d) | RSSI: %d dBm, SNR: %.1f dB\n",
                    seq, attempt, FUOTA_MAX_RETRIES, LoRa.packetRssi(), LoRa.packetSnr());

      // Backoff bertambah (incremental backoff)
      delay(40 + attempt * 25);
    }

    if (!chunkOk) {
      Serial.printf("[FUOTA Gateway] PERINGATAN: Chunk %u tidak di-ACK setelah %d percobaan!\n",
                    seq, FUOTA_MAX_RETRIES);

      // RESUME: Query status Node untuk mengetahui posisi seq yang diharapkan
      uint16_t remoteSeq = 0;
      bool queryOk = false;
      for (int q = 1; q <= 3; q++) {
        Serial.printf("[FUOTA Gateway] Mengirim QUERY status ke Node (percobaan %d/3)...\n", q);
        if (queryNodeStatus(targetNode, remoteSeq)) {
          queryOk = true;
          break;
        }
        delay(300);
      }

      if (queryOk && remoteSeq < totalChunks) {
        Serial.printf("[FUOTA Gateway] RESUME BERHASIL: Node mengharapkan chunk %u. Melanjutkan...\n", remoteSeq);
        if (remoteSeq == 0) {
          seq = 0xFFFF; // Akan di-increment jadi 0 di akhir loop
        } else {
          seq = remoteSeq - 1; // Akan di-increment jadi remoteSeq di akhir loop
        }
        consecutiveResumeFailures++;
        if (consecutiveResumeFailures > 5) {
          Serial.println("[FUOTA Gateway] Gagal: Terlalu banyak resume berturut-turut (>5x)!");
          file.close();
          sendAbort(targetNode, "Koneksi tidak stabil setelah berulang kali resume");
          return false;
        }
        continue;
      } else {
        Serial.println("[FUOTA Gateway] Node tidak merespon QUERY status! Menghentikan proses FUOTA.");
        file.close();
        sendAbort(targetNode, "Koneksi LoRa terputus saat transmisi data chunk");
        return false;
      }
    }

    // Log progress berkala
    if (seq % 20 == 0 || seq == totalChunks - 1) {
      float progressPercent = (float)(seq + 1) * 100.0f / totalChunks;
      Serial.printf("[FUOTA Gateway] Progress LoRa: %u/%u chunk (%.1f%%)\n",
                    seq + 1, totalChunks, progressPercent);

      if (millis() - lastFbUpdate > 10000 || seq == totalChunks - 1) {
        lastFbUpdate = millis();
        int fbProgress = 20 + (int)(progressPercent * 0.75f);
        FirebaseClient::updateOtaStatus(targetNode, "installing", fbProgress);
      }
    }
  }

  file.close();
  return true;
}

bool LoraFuotaGateway::sendComplete(const String &targetNode) {
  Serial.println("[FUOTA Gateway] Mengirim perintah COMPLETE ke Node...");

  for (int attempt = 1; attempt <= FUOTA_MAX_RETRIES; attempt++) {
    LoRa.beginPacket();
    LoRa.write(FUOTA_MAGIC_0);
    LoRa.write(FUOTA_MAGIC_1);
    LoRa.write(FUOTA_CMD_COMPLETE);
    LoRa.write((uint8_t)(totalFileSize & 0xFF));
    LoRa.write((uint8_t)((totalFileSize >> 8) & 0xFF));
    LoRa.write((uint8_t)((totalFileSize >> 16) & 0xFF));
    LoRa.write((uint8_t)((totalFileSize >> 24) & 0xFF));
    LoRa.endPacket();

    Serial.printf("[FUOTA Gateway] COMPLETE terkirim (percobaan %d/%d). Menunggu final ACK...\n",
                  attempt, FUOTA_MAX_RETRIES);

    if (waitForAck(FUOTA_CMD_COMPLETE, totalChunks, 5000)) {
      Serial.println("========================================");
      Serial.println("[FUOTA Gateway] SUKSES! Node berhasil flash firmware via LoRa!");
      Serial.println("========================================");
      return true;
    }
    delay(500);
  }

  Serial.println("[FUOTA Gateway] GAGAL: Node tidak merespon ACK final COMPLETE.");
  return false;
}

void LoraFuotaGateway::sendAbort(const String &targetNode, const char *reason) {
  Serial.print("[FUOTA Gateway] Mengirim ABORT ke Node: ");
  Serial.println(reason);

  LoRa.beginPacket();
  LoRa.write(FUOTA_MAGIC_0);
  LoRa.write(FUOTA_MAGIC_1);
  LoRa.write(FUOTA_CMD_ABORT);
  LoRa.endPacket();

  FirebaseClient::updateOtaStatus(targetNode, "failed", 0, reason);
  state = FUOTA_GW_ERROR;
}

bool LoraFuotaGateway::startFuota(const String &targetNode, const String &fwUrl,
                                 const String &version, uint32_t expectedSize,
                                 const String &expectedChecksum) {
  if (isBusy()) {
    Serial.println("[FUOTA Gateway] Proses FUOTA lain sedang berjalan!");
    return false;
  }

  currentTargetNode = targetNode;
  currentVersion = version;

  Serial.println("\n========================================");
  Serial.println("[FUOTA Gateway] MEMULAI LORA FUOTA UNTUK NODE: " + targetNode);
  Serial.println("[FUOTA Gateway] Target Versi: " + version);
  Serial.println("========================================");

  // 1. Download file dari server web ke SPIFFS
  state = FUOTA_GW_DOWNLOADING;
  if (!downloadToSpiffs(fwUrl, targetNode, expectedChecksum)) {
    state = FUOTA_GW_ERROR;
    return false;
  }

  // 2. Kirim pengumuman ANNOUNCE via LoRa
  state = FUOTA_GW_TRANSMITTING;
  if (!sendAnnounce(targetNode, version, totalFileSize, totalChunks)) {
    sendAbort(targetNode, "Node tidak merespon pengumuman FUOTA (offline atau di luar jangkauan LoRa)");
    return false;
  }

  // 3. Kirim data chunk satu per satu
  if (!sendChunks(targetNode)) {
    return false;
  }

  // 4. Finalisasi
  if (!sendComplete(targetNode)) {
    sendAbort(targetNode, "Gagal verifikasi final di sisi Node");
    return false;
  }

  // 5. Sukses! Hapus file temporer dan laporkan status
  if (LittleFS.exists(FUOTA_TEMP_FILE)) {
    LittleFS.remove(FUOTA_TEMP_FILE);
  }

  // Satu pintu via FirebaseClient (TLS + X-Device-Key + skema server yang benar).
  // Blok POST langsung yang lama dihapus: tanpa TLS, tanpa auth, skema salah (BUG-10).
  // Versi ikut dilaporkan agar kolom nodes.firmware_version tersinkron di server.
  FirebaseClient::updateOtaStatus(targetNode, "success", 100, "", currentVersion);
  state = FUOTA_GW_COMPLETED;
  return true;
}
#endif

