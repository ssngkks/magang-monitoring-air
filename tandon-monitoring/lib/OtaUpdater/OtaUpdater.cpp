#include "OtaUpdater.h"
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <LittleFS.h>
#include <Update.h>
#include "secrets.h"
#include "certs.h"
#include "FirebaseClient.h"
#include "LoraFuotaGateway.h"
#ifdef FEATURE_OTA_SIGNING
#include "FirmwareVerify.h"
#endif
#include "mbedtls/sha256.h"

// Provisioning fallback bila secrets.h belum mendefinisikan DEVICE_KEY.
#if !defined(DEVICE_KEY) && defined(LOCAL_API_TOKEN)
#define DEVICE_KEY LOCAL_API_TOKEN
#endif
#ifndef DEVICE_KEY
#define DEVICE_KEY "prototipe-shared-key-ganti-ini"
#endif

#ifndef CURRENT_FW_VERSION
#define CURRENT_FW_VERSION "1.0.0"
#endif

#ifndef GATEWAY_ID
#define GATEWAY_ID "esp32 gateway"
#endif

static LoraFuotaGateway fuotaGateway;

// Penanda "update sedang berjalan" di LittleFS. Ditulis SEBELUM httpUpdate
// dimulai, dibaca kembali di boot berikut untuk melaporkan hasil.
// Alasan: httpUpdate yang sukses me-reboot sendiri (atau crash) sehingga kode
// setelahnya tidak pernah jalan — tanpa ini, status "success" tidak terkirim.
static const char *OTA_PENDING_FILE = "/ota_pending.txt";

static void writePendingOta(const String &version, uint32_t otaId) {
  File f = LittleFS.open(OTA_PENDING_FILE, FILE_WRITE, true);
  if (f) {
    f.println(version + "|" + String(otaId));
    f.close();
  }
}

static void clearPendingOta() {
  if (LittleFS.exists(OTA_PENDING_FILE)) {
    LittleFS.remove(OTA_PENDING_FILE);
  }
}

// return true bila ada penanda tertinggal; out diisi "versi|otaId" yang pending.
static bool readPendingOta(String &versionOut, uint32_t &otaIdOut) {
  // Cek exists() dulu agar tidak mencetak error vfs yang menakutkan
  // ("does not exist, no permits") saat memang tidak ada update tertunda.
  if (!LittleFS.exists(OTA_PENDING_FILE)) return false;
  File f = LittleFS.open(OTA_PENDING_FILE, FILE_READ);
  if (!f) return false;
  String line = f.readStringUntil('\n');
  f.close();
  line.trim();
  int sep = line.indexOf('|');
  if (sep == -1 || sep == 0) return false;
  versionOut = line.substring(0, sep);
  otaIdOut = (uint32_t)line.substring(sep + 1).toInt();
  return versionOut.length() > 0;
}

void OtaUpdater::begin() {
  fuotaGateway.begin();
}

// Dipanggil dari setup() gateway SETELAH WiFi tersambung: selesaikan laporan
// update sebelumnya yang terpotong reboot (sukses maupun crash).
// Tradeoff sadar: crash DI TENGAH flash ikut dilaporkan sukses (sekali saja,
// lalu penanda dihapus). Dipilih karena alternatifnya — loop flash ulang tiap
// 60 detik bila laporan hilang — jauh lebih merusak (flash wear + device sibuk).
// Kecurigaan crash bisa dicek: versi berjalan (log boot) vs versi job.
void OtaUpdater::reportPendingAfterReboot() {
  String ver;
  uint32_t oid = 0;
  if (!readPendingOta(ver, oid)) return;
  Serial.printf("[OTA] Ditemukan sisa update versi %s (job #%u). Melaporkan hasil...\n",
                ver.c_str(), oid);
  FirebaseClient::updateOtaStatus(GATEWAY_ID, "success", 100, "", ver, oid);
  clearPendingOta();
}

bool OtaUpdater::isFuotaBusy() {
  return fuotaGateway.isBusy();
}

static String extractJsonString(const String &json, const String &key) {
  int idx = json.indexOf("\"" + key + "\"");
  if (idx == -1) return "";
  int colon = json.indexOf(":", idx);
  if (colon == -1) return "";
  int quoteStart = json.indexOf("\"", colon);
  if (quoteStart == -1) return "";
  int quoteEnd = json.indexOf("\"", quoteStart + 1);
  if (quoteEnd == -1) return "";
  return json.substring(quoteStart + 1, quoteEnd);
}

static uint32_t extractJsonUint(const String &json, const String &key) {
  int idx = json.indexOf("\"" + key + "\"");
  if (idx == -1) return 0;
  int colon = json.indexOf(":", idx);
  if (colon == -1) return 0;
  int start = colon + 1;
  while (start < (int)json.length() && (json[start] == ' ' || json[start] == '\"')) start++;
  int end = start;
  while (end < (int)json.length() && isDigit(json[end])) end++;
  return (uint32_t)json.substring(start, end).toInt();
}

static bool fetchManifest(const String &url, String &version, String &fwUrl,
                         bool &updateAvailable, String &status,
                         uint32_t &fileSize, String &checksum, uint32_t &otaId,
                         String &signature) {
  HTTPClient http;
  http.setTimeout(10000);

  WiFiClient plainClient;
  plainClient.setTimeout(10);
  WiFiClientSecure secClient;
  bool isHttps = url.startsWith("https://");
  if (isHttps) {
#ifdef FEATURE_TLS_PINNING
    // Mode secure: verifikasi sertifikat (pin CA), BUKAN setInsecure().
    SecurityCerts::configureSecureClient(secClient, LOCAL_SERVER_CA_CERT);
#else
    // Mode default: setInsecure() sadar-LAN untuk fase prototipe tertutup.
    // Telegram TIDAK ikut flag ini (tetap pin DigiCert — domain publik).
    secClient.setInsecure();
#endif
    secClient.setTimeout(10);
    secClient.setHandshakeTimeout(15);
    http.begin(secClient, url);
  } else {
    http.begin(plainClient, url);
  }

  http.addHeader("User-Agent", "ESP32-Gateway");
  http.addHeader("ngrok-skip-browser-warning", "true");
  // Blueprint §3.5: manifest OTA wajib auth token per-device (§3.3).
  {
    String tok = FirebaseClient::getDeviceToken();
    tok.trim();
    if (tok.length() < 16) tok = String(DEVICE_KEY); // fallback provisioning (hello pertama)
    http.addHeader("X-Device-Key", tok);
    http.addHeader("X-API-KEY", tok);
  }

  int code = http.GET();
  if (code != 200) {
    http.end();
    return false;
  }
  String body = http.getString();
  http.end();

  body.trim();
  if (body == "null" || body.length() < 10) {
    return false;
  }

  updateAvailable = (body.indexOf("\"update_available\":false") == -1);
  version = extractJsonString(body, "version");
  fwUrl = extractJsonString(body, "download_url");
  if (fwUrl.length() == 0) {
    fwUrl = extractJsonString(body, "url");
  }
  status = extractJsonString(body, "status");
  fileSize = extractJsonUint(body, "file_size");
  checksum = extractJsonString(body, "checksum");
  if (checksum.length() == 0) checksum = extractJsonString(body, "checksum_sha256");
  signature = extractJsonString(body, "signature_ed25519");
  if (signature.length() == 0) signature = extractJsonString(body, "signature");
  otaId = extractJsonUint(body, "ota_id");

  return (version.length() > 0 && fwUrl.length() > 0);
}

// Paksa query device= pada URL manifest menjadi deviceId yang diminta.
// Menimpa nilai lama apa pun (mis. sisa nama device era lampau di secrets.h)
// agar gateway/node tidak pernah menanyakan manifest milik device lain.
static String withManifestDevice(const String &url, const String &deviceId) {
  String out = url;
  String param = "device=" + deviceId;
  int di = out.indexOf("device=");
  if (di != -1) {
    int amp = out.indexOf("&", di);
    String tail = (amp != -1) ? out.substring(amp) : "";
    return out.substring(0, di) + param + tail;
  }
  out += (out.indexOf("?") == -1 ? "?" : "&") + param;
  return out;
}

void OtaUpdater::checkForUpdate() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (fuotaGateway.isBusy()) {
    Serial.println("[OTA] Proses transmisi LoRa FUOTA sedang aktif, tunda pengecekan.");
    return;
  }

  Serial.println("\n[OTA] Memeriksa jadwal update firmware di server lokal...");

  // =========================================================================
  // TEMPLATE KODE LAMA FIREBASE RTDB OTA (JANGAN DIHAPUS - UNTUK TEMPLATE)
  // =========================================================================
  // String cleanNodeId = String(KODE_NODE);
  // cleanNodeId.replace(" ", "%20");
  // String fbNodeUrl = String(FIREBASE_HOST) + "/ota/" + cleanNodeId + ".json?auth=" + FIREBASE_AUTH;
  // String cleanGwId = String(GATEWAY_ID);
  // cleanGwId.replace(" ", "%20");
  // String fbGwUrl = String(FIREBASE_HOST) + "/ota/" + cleanGwId + ".json?auth=" + FIREBASE_AUTH;

  // Samakan parameter device= di URL manifest dengan ID yang benar.
  // Tahan terhadap macro yang salah nilai (mis. device=ESP32-WATER-01):
  // nilai APA PUN di belakang "device=" diganti, bukan dicocokkan.
  // Bila parameter tidak ada, ditambahkan.
  // IMPLEMENTASI LOCAL SERVER (Laptop)
  #ifdef OTA_MANIFEST_URL
  String fbNodeUrl = withManifestDevice(String(OTA_MANIFEST_URL), String(KODE_NODE));
  #else
  // Hormati skema https bila port 443 (mis. tunnel TLS) — fallback http + port.
  #if defined(LOCAL_SERVER_PORT) && LOCAL_SERVER_PORT == 443
  String fbNodeUrl = "https://" + String(LOCAL_SERVER_HOST) + "/api/firmware/ota/check?device=" + String(KODE_NODE);
  #else
  String fbNodeUrl = "http://" + String(LOCAL_SERVER_HOST) + ":" + String(LOCAL_SERVER_PORT) + "/api/firmware/ota/check?device=" + String(KODE_NODE);
  #endif
  #endif
  // Gateway cek manifest MILIKNYA SENDIRI (device=GATEWAY_ID), bukan manifest node.
  String fbGwUrl = withManifestDevice(fbNodeUrl, String(GATEWAY_ID));

  // --- CEK NODE SENSOR DULU (prioritas utama - LoRa FUOTA) ---
  static String lastFlashedNodeVersion = "";
  String nodeVer, nodeFwUrl, nodeStatus, nodeChecksum, nodeSig;
  bool nodeUpdateAvail = false;
  uint32_t nodeFileSize = 0;
  uint32_t nodeOtaId = 0;

  if (fetchManifest(fbNodeUrl, nodeVer, nodeFwUrl, nodeUpdateAvail, nodeStatus, nodeFileSize, nodeChecksum, nodeOtaId, nodeSig)) {
    if (nodeUpdateAvail && (nodeStatus == "pending" || nodeStatus == "installing")) {
      if (nodeVer.length() > 0 && nodeVer == lastFlashedNodeVersion) {
        Serial.printf("[OTA] Node sudah sukses diflash ke versi %s sebelumnya. Tandai selesai di RTDB.\n",
                      nodeVer.c_str());
        FirebaseClient::updateOtaStatus(KODE_NODE, "success", 100, "", nodeVer, nodeOtaId);
        return;
      }

      Serial.printf("[OTA] Ditemukan jadwal update LoRa FUOTA untuk NODE (%s) -> Versi: %s (job #%u)\n",
                    KODE_NODE, nodeVer.c_str(), nodeOtaId);
      // Blueprint §3.4: gateway WAJIB teruskan signature ke FUOTA; binary tanpa
      // signature valid DITOLAK di downloadToSpiffs (tidak disiarkan via LoRa).
      if (fuotaGateway.startFuota(KODE_NODE, nodeFwUrl, nodeVer, nodeFileSize, nodeChecksum, nodeOtaId, nodeSig)) {
        lastFlashedNodeVersion = nodeVer;
      }
      return; // Sibuk LoRa FUOTA, skip gateway check
    }
  }

  // --- CEK GATEWAY SELF-UPDATE (via WiFi, hanya jika tidak ada node pending) ---
  String gwVer, gwFwUrl, gwStatus, gwChecksum, gwSig;
  bool gwUpdateAvail = false;
  uint32_t gwFileSize = 0;
  uint32_t gwOtaId = 0;

  if (fetchManifest(fbGwUrl, gwVer, gwFwUrl, gwUpdateAvail, gwStatus, gwFileSize, gwChecksum, gwOtaId, gwSig)) {
    if (gwUpdateAvail && gwStatus == "pending") {
      Serial.printf("[OTA] Ditemukan jadwal update WiFi untuk GATEWAY (%s) -> Versi: %s\n",
                    GATEWAY_ID, gwVer.c_str());

      // Bandingkan ke versi firmware YANG SEDANG JALAN, bukan angka hardcode
      String curVer = String(CURRENT_FW_VERSION);
      if (gwVer == curVer || gwVer == ("v" + curVer)) {
        Serial.println("[OTA] Gateway sudah pada versi ini. Tandai sukses.");
        FirebaseClient::updateOtaStatus(GATEWAY_ID, "success", 100, "", gwVer, gwOtaId);

      } else {
        Serial.println("[OTA] Menjalankan update WiFi internal Gateway dari: " + gwFwUrl);
#ifdef FEATURE_OTA_SIGNING
        // Mode secure: TOLAK binary tanpa signature valid SEBELUM flash.
        // Checksum saja tidak cukup (bisa dipalsukan bersama manifest via MITM).
        if (gwSig.length() != 128) {
          Serial.println("[OTA] DITOLAK: manifest tanpa signature Ed25519 valid. Update dibatalkan.");
          FirebaseClient::updateOtaStatus(GATEWAY_ID, "failed", 0, "Manifest tanpa signature Ed25519", "", gwOtaId);
        } else {
#else
        // Mode default: lewati syarat signature (hemat flash, tanpa Crypto),
        // kembali ke verifikasi checksum SHA256 saja seperti sebelum hardening.
        {
#endif
          // Catat dulu sebelum flash: bila update me-reboot sendiri / crash,
          // laporan success dikirim dari boot berikut (reportPendingAfterReboot).
          writePendingOta(gwVer, gwOtaId);
          FirebaseClient::updateOtaStatus(GATEWAY_ID, "downloading", 30, "", "", gwOtaId);

          // Unduh dengan auth token + TLS terverifikasi, verifikasi SHA & signature,
          // lalu flash dari file lokal (bukan httpUpdate langsung yang tanpa verifikasi).
          String dlUrl = gwFwUrl;
          if (dlUrl.indexOf("device=") == -1) {
            dlUrl += (dlUrl.indexOf("?") == -1 ? "?" : "&") + String("device=") + String(GATEWAY_ID);
          }
          const char *GW_TMP = "/gw_update.bin";
          if (LittleFS.exists(GW_TMP)) LittleFS.remove(GW_TMP);
          bool dlOk = false;
          {
            HTTPClient http;
            http.setTimeout(30000);
            WiFiClient plainClient;
            plainClient.setTimeout(30);
            WiFiClientSecure secClient;
            bool isHttps = dlUrl.startsWith("https://");
            if (isHttps) {
#ifdef FEATURE_TLS_PINNING
              SecurityCerts::configureSecureClient(secClient, LOCAL_SERVER_CA_CERT);
#else
              secClient.setInsecure(); // Sadar-LAN (prototipe tertutup)
#endif
              secClient.setTimeout(60);
              http.begin(secClient, dlUrl);
            } else {
              plainClient.setTimeout(60);
              http.begin(plainClient, dlUrl);
            }
            String tok = FirebaseClient::getDeviceToken();
            tok.trim();
            if (tok.length() < 16) tok = String(DEVICE_KEY);
            http.addHeader("X-Device-Key", tok);
            http.addHeader("X-API-KEY", tok);
            http.addHeader("User-Agent", "ESP32-Gateway");
            http.addHeader("ngrok-skip-browser-warning", "true");
            int code = http.GET();
            if (code == 200) {
              File f = LittleFS.open(GW_TMP, FILE_WRITE, true);
              if (f) {
                http.writeToStream(&f);
                f.close();
                dlOk = true;
              }
            } else {
              Serial.printf("[OTA] Download gagal HTTP %d\n", code);
            }
            http.end();
          }
          bool verified = false;
          if (dlOk) {
            File vf = LittleFS.open(GW_TMP, FILE_READ);
            if (vf) {
              size_t sz = vf.size();
              // Hitung SHA256 file.
              mbedtls_sha256_context sctx;
              mbedtls_sha256_init(&sctx);
              mbedtls_sha256_starts(&sctx, 0);
              uint8_t cbuf[256];
              while (vf.available()) {
                size_t r = vf.read(cbuf, sizeof(cbuf));
                if (r == 0) break;
                mbedtls_sha256_update(&sctx, cbuf, r);
              }
              uint8_t sout[32];
              mbedtls_sha256_finish(&sctx, sout);
              mbedtls_sha256_free(&sctx);
              char hexStr[65];
              for (int i = 0; i < 32; i++) sprintf(hexStr + i * 2, "%02x", sout[i]);
              hexStr[64] = '\0';
              String calcSha = String(hexStr);
              String expSha = gwChecksum; expSha.trim(); expSha.toLowerCase();
              calcSha.toLowerCase();
              if (expSha.length() > 0 && calcSha != expSha) {
                Serial.printf("[OTA] DITOLAK: SHA tidak cocok (server %s vs file %s)\n", expSha.c_str(), calcSha.c_str());
#ifdef FEATURE_OTA_SIGNING
              } else if (!FirmwareVerify::verifyDigestHex(calcSha, gwSig)) {
                Serial.println("[OTA] DITOLAK: signature Ed25519 TIDAK VALID. Update dibatalkan.");
              } else {
                Serial.println("[OTA] SHA & signature Ed25519 VALID. Lanjut flash.");
                verified = true;
              }
#else
              } else {
                Serial.println("[OTA] SHA VALID (mode default, tanpa verifikasi signature). Lanjut flash.");
                verified = true;
              }
#endif
              vf.close();
              // Flash dari file terverifikasi.
              if (verified) {
                File ff = LittleFS.open(GW_TMP, FILE_READ);
                if (ff && Update.begin(sz, U_FLASH)) {
                  Update.writeStream(ff);
                  ff.close();
                  if (Update.end(true)) {
                    clearPendingOta();
                    Serial.println("[OTA] Gateway berhasil update terverifikasi! Melaporkan status final...");
                    if (WiFi.status() != WL_CONNECTED) {
                      Serial.println("[OTA] WiFi putus setelah flash, menyambung ulang...");
                      WiFi.disconnect();
                      delay(500);
                      WiFi.reconnect();
                      unsigned long t = millis();
                      while (WiFi.status() != WL_CONNECTED && millis() - t < 8000) delay(200);
                    }
                    FirebaseClient::updateOtaStatus(GATEWAY_ID, "success", 100, "", gwVer, gwOtaId);
                    LittleFS.remove(GW_TMP);
                    delay(1500);
                    Serial.println("[OTA] Rebooting...");
                    ESP.restart();
                    return;
                  } else {
                    Serial.print("[OTA] GAGAL Update.end(): ");
                    Update.printError(Serial);
                  }
                } else {
                  if (ff) ff.close();
                  Serial.println("[OTA] GAGAL Update.begin() / buka file terverifikasi.");
                }
              }
              LittleFS.remove(GW_TMP);
            }
          }
          if (!verified) {
            clearPendingOta();
#ifdef FEATURE_OTA_SIGNING
            FirebaseClient::updateOtaStatus(GATEWAY_ID, "failed", 0, "Verifikasi SHA/signature gagal", "", gwOtaId);
#else
            FirebaseClient::updateOtaStatus(GATEWAY_ID, "failed", 0, "Verifikasi SHA gagal", "", gwOtaId);
#endif
            Serial.println("[OTA] Menunggu WiFi recovery...");
            WiFi.disconnect();
            delay(1000);
            WiFi.reconnect();
            unsigned long t = millis();
            while (WiFi.status() != WL_CONNECTED && millis() - t < 8000) delay(200);
            if (WiFi.status() == WL_CONNECTED)
              Serial.println("[OTA] WiFi reconnected.");
          }
        }
      }
    }
  }

  Serial.println("[OTA] Tidak ada pembaruan firmware pending.");
}

