#pragma once
#include <Arduino.h>

// ============================================================
// LORA FUOTA (Firmware Update Over The Air via LoRa)
// Protocol & Packet Definitions
// ============================================================

#define FUOTA_MAGIC_0         0xF0
#define FUOTA_MAGIC_1         0x07
#define FUOTA_CHUNK_SIZE      192   // Byte per LoRa packet (safe for 255-byte LoRa FIFO)
#define FUOTA_MAX_RETRIES     10    // Retry per chunk if ACK missing (dinaikkan dari 5 ke 10)
#define FUOTA_ACK_TIMEOUT_MS  2500  // Timeout per chunk ACK (2.5s)

// Command codes
enum FuotaCommand : uint8_t {
  FUOTA_CMD_NONE      = 0x00,
  FUOTA_CMD_ANNOUNCE  = 0x01,  // Gateway -> Node: New firmware announcement
  FUOTA_CMD_CHUNK     = 0x02,  // Gateway -> Node: Firmware data chunk
  FUOTA_CMD_COMPLETE  = 0x03,  // Gateway -> Node: All chunks sent, finalize
  FUOTA_CMD_QUERY     = 0x04,  // Gateway -> Node: Query current expected chunk seq
  FUOTA_CMD_ACK       = 0x10,  // Node -> Gateway: Success ACK
  FUOTA_CMD_NACK      = 0x11,  // Node -> Gateway: Error / retransmit request
  FUOTA_CMD_ABORT     = 0x12,  // Gateway <-> Node: Cancel / abort process
  FUOTA_CMD_STATUS    = 0x13,  // Node -> Gateway: Status response (expectedChunkSeq)
};

// Response status codes
enum FuotaStatus : uint8_t {
  FUOTA_STATUS_OK              = 0x00,
  FUOTA_STATUS_BUSY            = 0x01,
  FUOTA_STATUS_FLASH_ERROR     = 0x02,
  FUOTA_STATUS_CRC_MISMATCH    = 0x03,
  FUOTA_STATUS_SIZE_MISMATCH   = 0x04,
  FUOTA_STATUS_SEQ_ERROR       = 0x05,
  FUOTA_STATUS_TIMEOUT         = 0x06,
  FUOTA_STATUS_UNKNOWN_TARGET  = 0x07,
  FUOTA_STATUS_LEN_ERROR       = 0x08,
  FUOTA_STATUS_ALREADY_LATEST  = 0x09, // Node sudah menjalankan versi ini — tolak tanpa flash ulang
};

namespace LoraFuota {

  // Simple and fast standard CRC16-CCITT for chunk validation
  inline uint16_t calculateCrc16(const uint8_t *data, size_t len) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < len; i++) {
      crc ^= (uint16_t)data[i] << 8;
      for (uint8_t j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc <<= 1;
        }
      }
    }
    return crc;
  }

  // Check if packet buffer starts with FUOTA magic bytes
  inline bool isFuotaPacket(const uint8_t *buffer, size_t len) {
    return (len >= 3 && buffer[0] == FUOTA_MAGIC_0 && buffer[1] == FUOTA_MAGIC_1);
  }

} // namespace LoraFuota
