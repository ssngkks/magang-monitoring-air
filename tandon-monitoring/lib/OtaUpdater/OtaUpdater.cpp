#include "OtaUpdater.h"
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include "secrets.h"
#include "FirebaseClient.h"
#include "LoraFuotaGateway.h"

#ifndef CURRENT_FW_VERSION
#define CURRENT_FW_VERSION "1.0.0"
#endif

#ifndef GATEWAY_ID
#define GATEWAY_ID "esp32 gateway"
#endif

static LoraFuotaGateway fuotaGateway;

void OtaUpdater::begin() {
  fuotaGateway.begin();
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
                         uint32_t &fileSize, String &checksum, uint32_t &otaId) {
  HTTPClient http;
  http.setTimeout(10000);

  static WiFiClientSecure secClient;
  bool isHttps = url.startsWith("https://");
  if (isHttps) {
    secClient.setInsecure();
    secClient.setTimeout(10);
    secClient.setHandshakeTimeout(15);
    http.begin(secClient, url);
  } else {
    http.begin(url);
  }

  http.addHeader("User-Agent", "ESP32-Gateway");
  http.addHeader("ngrok-skip-browser-warning", "true");

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
  otaId = extractJsonUint(body, "ota_id");

  return (version.length() > 0 && fwUrl.length() > 0);
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

  // IMPLEMENTASI LOCAL SERVER (Laptop)
  #ifdef OTA_MANIFEST_URL
  String fbNodeUrl = String(OTA_MANIFEST_URL);
  #else
  // Hormati skema https bila port 443 (mis. tunnel TLS) — fallback http + port.
  #if defined(LOCAL_SERVER_PORT) && LOCAL_SERVER_PORT == 443
  String fbNodeUrl = "https://" + String(LOCAL_SERVER_HOST) + "/api/firmware/ota/check?device=" + String(KODE_NODE);
  #else
  String fbNodeUrl = "http://" + String(LOCAL_SERVER_HOST) + ":" + String(LOCAL_SERVER_PORT) + "/api/firmware/ota/check?device=" + String(KODE_NODE);
  #endif
  #endif
  // Gateway cek manifest MILIKNYA SENDIRI (device=GATEWAY_ID), bukan manifest node.
  // Sebelumnya fbGwUrl = fbNodeUrl sehingga pending OTA gateway tidak pernah terlihat.
  String fbGwUrl = fbNodeUrl;
  {
    String nodeParam = "device=" + String(KODE_NODE);
    String gwParam = "device=" + String(GATEWAY_ID);
    int di = fbGwUrl.indexOf(nodeParam);
    if (di != -1) {
      fbGwUrl = fbGwUrl.substring(0, di) + gwParam + fbGwUrl.substring(di + nodeParam.length());
    } else if (fbGwUrl.indexOf("device=") == -1) {
      fbGwUrl += (fbGwUrl.indexOf("?") == -1 ? "?" : "&") + gwParam;
    }
  }

  // --- CEK NODE SENSOR DULU (prioritas utama - LoRa FUOTA) ---
  static String lastFlashedNodeVersion = "";
  String nodeVer, nodeFwUrl, nodeStatus, nodeChecksum;
  bool nodeUpdateAvail = false;
  uint32_t nodeFileSize = 0;
  uint32_t nodeOtaId = 0;

  if (fetchManifest(fbNodeUrl, nodeVer, nodeFwUrl, nodeUpdateAvail, nodeStatus, nodeFileSize, nodeChecksum, nodeOtaId)) {
    if (nodeUpdateAvail && (nodeStatus == "pending" || nodeStatus == "installing")) {
      if (nodeVer.length() > 0 && nodeVer == lastFlashedNodeVersion) {
        Serial.printf("[OTA] Node sudah sukses diflash ke versi %s sebelumnya. Tandai selesai di RTDB.\n",
                      nodeVer.c_str());
        FirebaseClient::updateOtaStatus(KODE_NODE, "success", 100, "", nodeVer, nodeOtaId);
        return;
      }

      Serial.printf("[OTA] Ditemukan jadwal update LoRa FUOTA untuk NODE (%s) -> Versi: %s (job #%u)\n",
                    KODE_NODE, nodeVer.c_str(), nodeOtaId);
      if (fuotaGateway.startFuota(KODE_NODE, nodeFwUrl, nodeVer, nodeFileSize, nodeChecksum, nodeOtaId)) {
        lastFlashedNodeVersion = nodeVer;
      }
      return; // Sibuk LoRa FUOTA, skip gateway check
    }
  }

  // --- CEK GATEWAY SELF-UPDATE (via WiFi, hanya jika tidak ada node pending) ---
  String gwVer, gwFwUrl, gwStatus, gwChecksum;
  bool gwUpdateAvail = false;
  uint32_t gwFileSize = 0;
  uint32_t gwOtaId = 0;

  if (fetchManifest(fbGwUrl, gwVer, gwFwUrl, gwUpdateAvail, gwStatus, gwFileSize, gwChecksum, gwOtaId)) {
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
        FirebaseClient::updateOtaStatus(GATEWAY_ID, "downloading", 30, "", "", gwOtaId);

        bool isHttps = gwFwUrl.startsWith("https://");
        t_httpUpdate_return result;
        if (isHttps) {
          WiFiClientSecure secClient;
          secClient.setInsecure();
          secClient.setTimeout(60);
          result = httpUpdate.update(secClient, gwFwUrl);
        } else {
          WiFiClient plainClient;
          plainClient.setTimeout(60); // 60 detik cukup untuk 1MB di LAN
          result = httpUpdate.update(plainClient, gwFwUrl);
        }

        if (result == HTTP_UPDATE_OK) {
          Serial.println("[OTA] Gateway berhasil update! Melaporkan status final...");
          // Flash lama bisa memutus WiFi: sambungkan ulang dulu agar laporan
          // success tidak hilang (job nyangkut "flashing" di dashboard).
          if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[OTA] WiFi putus setelah flash, menyambung ulang...");
            WiFi.disconnect();
            delay(500);
            WiFi.reconnect();
            unsigned long t = millis();
            while (WiFi.status() != WL_CONNECTED && millis() - t < 8000) delay(200);
          }
          FirebaseClient::updateOtaStatus(GATEWAY_ID, "success", 100, "", gwVer, gwOtaId);
          delay(1500); // beri waktu respons server terbaca sebelum restart
          Serial.println("[OTA] Rebooting...");
          ESP.restart();
          return;
        } else {
          String err = httpUpdate.getLastErrorString();
          Serial.printf("[OTA] GAGAL flash Gateway (%d): %s\n", httpUpdate.getLastError(), err.c_str());
          FirebaseClient::updateOtaStatus(GATEWAY_ID, "failed", 0, err, "", gwOtaId);

          // Reconnect WiFi agar stack bersih setelah timeout besar
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

  Serial.println("[OTA] Tidak ada pembaruan firmware pending.");
}

