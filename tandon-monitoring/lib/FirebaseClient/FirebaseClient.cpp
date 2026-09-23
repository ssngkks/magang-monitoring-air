#include "FirebaseClient.h"
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "secrets.h"

/* =========================================================================
 * TEMPLATE KODE LAMA FIREBASE REALTIME DATABASE (JANGAN DIHAPUS - UNTUK TEMPLATE)
 * =========================================================================
 * static void putOrPostFirebase(const String &path, const String &json, bool usePost) {
 *   if (WiFi.status() != WL_CONNECTED) return;
 *   HTTPClient http;
 *   http.setTimeout(3000);
 *   String url = String(FIREBASE_HOST) + path + ".json?auth=" + FIREBASE_AUTH;
 *   http.begin(url);
 *   http.addHeader("Content-Type", "application/json");
 *   int httpCode = usePost ? http.POST(json) : http.PUT(json);
 *   http.end();
 * }
 *
 * void sendLatestFirebase(const String &jsonPayload) {
 *   putOrPostFirebase("/sensor/latest", jsonPayload, false);
 * }
 *
 * void sendHistoryFirebase(const String &jsonPayload) {
 *   putOrPostFirebase("/sensor/history", jsonPayload, true);
 * }
 *
 * String readCommandFirebase(const String &kodeNode, const String &key) { ... }
 * void clearCommandFirebase(const String &kodeNode, const String &key) { ... }
 * void updateOtaStatusFirebase(...) { ... }
 * ========================================================================= */

// =========================================================================
// IMPLEMENTASI KOMUNIKASI SERVER LOKAL LAPTOP (MySQL & phpMyAdmin)
// =========================================================================

// Shared device key prototipe LAN (audit.md §7), kompatibel nama lama.
#if !defined(DEVICE_KEY) && defined(LOCAL_API_TOKEN)
#define DEVICE_KEY LOCAL_API_TOKEN
#endif
#ifndef DEVICE_KEY
#define DEVICE_KEY "prototipe-shared-key-ganti-ini"
#endif

// Basis URL Laravel, mis. "http://192.168.1.10:8000" (tanpa trailing slash).
static String localBaseUrl() {
  #ifdef LOCAL_SERVER_URL
  String baseUrl = String(LOCAL_SERVER_URL);
  int idx = baseUrl.indexOf("/api/");
  if (idx != -1) baseUrl = baseUrl.substring(0, idx);
  return baseUrl;
  #else
  return "http://" + String(LOCAL_SERVER_HOST) + ":" + String(LOCAL_SERVER_PORT);
  #endif
}

// POST JSON generik dengan dukungan http/https + auth header ganda.
static int postJson(const String &url, const String &payload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[LOCAL SERVER] WiFi tidak terhubung, request dibatalkan.");
    return -1;
  }

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

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");
  http.addHeader("User-Agent", "ESP32-Gateway");
  http.addHeader("X-Device-Key", DEVICE_KEY);   // auth utama (audit.md §7)
  http.addHeader("X-API-KEY", DEVICE_KEY);      // kompatibilitas server lama
  http.addHeader("ngrok-skip-browser-warning", "true");

  int httpCode = http.POST(payload);
  http.end();
  return httpCode;
}

static void sendToLocalServer(const String &jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[LOCAL SERVER] WiFi tidak terhubung, data belum terkirim.");
    return;
  }

  HTTPClient http;
  http.setTimeout(10000); // 10 detik timeout untuk memastikan handshake TLS tidak terputus prematur

  #ifdef LOCAL_SERVER_URL
  String url = String(LOCAL_SERVER_URL);
  #else
  String url = "http://" + String(LOCAL_SERVER_HOST) + ":" + String(LOCAL_SERVER_PORT) + "/api/sensor/store";
  #endif

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

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");
  http.addHeader("User-Agent", "ESP32-Gateway");
  http.addHeader("X-Device-Key", DEVICE_KEY);   // auth utama (audit.md §7)
  http.addHeader("X-API-KEY", DEVICE_KEY);      // kompatibilitas server lama
  http.addHeader("ngrok-skip-browser-warning", "true");

  int httpCode = http.POST(jsonPayload);

  Serial.print("[LOCAL MYSQL SERVER] Kirim data ke ");
  Serial.print(url);
  Serial.print(" : ");
  if (httpCode > 0) {
    Serial.printf("BERHASIL (HTTP %d)\n", httpCode);
  } else {
    Serial.println("GAGAL (" + http.errorToString(httpCode) + ")");
  }

  http.end();
}

void FirebaseClient::sendLatest(const String &jsonPayload) {
  // Pada arsitektur lokal MySQL, data langsung dikirim ke backend Laravel & MySQL
  sendToLocalServer(jsonPayload);
}

void FirebaseClient::sendHistory(const String &jsonPayload) {
  // Dalam arsitektur lokal MySQL, endpoint /api/sensor/store pada sendLatest() sudah
  // otomatis menyimpan setiap pembacaan ke tabel riwayat (sensor_data).
  // Mengosongkan pemanggilan kedua ini mencegah duplikasi data serta tabrakan koneksi TLS ganda.
  (void)jsonPayload;
}

// POST /api/devices/hello — SEKALI saat boot & WiFi connect (audit.md §5.1-§5.3).
bool FirebaseClient::sendHello(const String &deviceId, const String &deviceRole,
                               const String &firmwareVersion, const String &capabilitiesCsv) {
  String url = localBaseUrl() + "/api/devices/hello";

  // Bangun array JSON capabilities dari CSV "a,b,c".
  String capsJson = "[";
  bool firstCap = true;
  int start = 0;
  while (start <= (int)capabilitiesCsv.length()) {
    int comma = capabilitiesCsv.indexOf(',', start);
    String cap = (comma == -1) ? capabilitiesCsv.substring(start) : capabilitiesCsv.substring(start, comma);
    cap.trim();
    if (cap.length() > 0) {
      if (!firstCap) capsJson += ",";
      firstCap = false;
      capsJson += "\"" + cap + "\"";
    }
    if (comma == -1) break;
    start = comma + 1;
  }
  capsJson += "]";

  String payload = "{";
  payload += "\"device_id\":\"" + deviceId + "\",";
  payload += "\"device_role\":\"" + deviceRole + "\",";
  payload += "\"device_key\":\"" + String(DEVICE_KEY) + "\",";
  payload += "\"firmware_version\":\"" + firmwareVersion + "\",";
  payload += "\"hardware_id\":\"" + WiFi.macAddress() + "\",";
  payload += "\"ip_address\":\"" + WiFi.localIP().toString() + "\",";
  payload += "\"capabilities\":" + capsJson;
  payload += "}";

  int httpCode = postJson(url, payload);
  Serial.printf("[HELLO] %s (%s) -> HTTP %d\n", deviceId.c_str(), deviceRole.c_str(), httpCode);
  return (httpCode == 200 || httpCode == 202);
}

// POST /api/devices/heartbeat — tiap ±15 detik (audit.md §5.6).
bool FirebaseClient::sendHeartbeat(const String &deviceId) {
  String url = localBaseUrl() + "/api/devices/heartbeat";

  String payload = "{";
  payload += "\"device_id\":\"" + deviceId + "\",";
  payload += "\"device_key\":\"" + String(DEVICE_KEY) + "\",";
  payload += "\"uptime\":" + String(millis() / 1000UL) + ",";
  payload += "\"wifi_rssi\":" + String(WiFi.RSSI());
  payload += "}";

  int httpCode = postJson(url, payload);
  if (httpCode != 200) {
    Serial.printf("[HEARTBEAT] %s -> HTTP %d\n", deviceId.c_str(), httpCode);
  }
  return (httpCode == 200);
}

void FirebaseClient::updateOtaStatus(const String &kodeNode, const String &status, int progress, const String &error, const String &version, long otaId) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.setTimeout(10000);

  #ifdef LOCAL_SERVER_URL
  String baseUrl = String(LOCAL_SERVER_URL);
  int idx = baseUrl.indexOf("/api/");
  if (idx != -1) baseUrl = baseUrl.substring(0, idx);
  String url = baseUrl + "/api/firmware/ota/status";
  #else
  String url = "http://" + String(LOCAL_SERVER_HOST) + ":" + String(LOCAL_SERVER_PORT) + "/api/firmware/ota/status";
  #endif

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

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");
  http.addHeader("User-Agent", "ESP32-Gateway");
  http.addHeader("X-Device-Key", DEVICE_KEY);   // auth utama (audit.md §7)
  http.addHeader("X-API-KEY", DEVICE_KEY);      // kompatibilitas server lama
  http.addHeader("ngrok-skip-browser-warning", "true");

  // Skema ganda agar cocok dengan validasi server (kode_node/device,
  // progress_percent/progress, error_message/error).
  String payload = "{";
  payload += "\"kode_node\":\"" + kodeNode + "\",";
  payload += "\"device\":\"" + kodeNode + "\",";
  payload += "\"status\":\"" + status + "\",";
  payload += "\"progress_percent\":" + String(progress) + ",";
  payload += "\"progress\":" + String(progress);
  if (error.length() > 0) {
    String escError = error;
    escError.replace("\"", "\\\"");
    payload += ",\"error_message\":\"" + escError + "\",";
    payload += "\"error\":\"" + escError + "\"";
  }
  if (version.length() > 0) {
    payload += ",\"version\":\"" + version + "\"";
  }
  if (otaId > 0) {
    payload += ",\"ota_id\":" + String(otaId);
  }
  payload += "}";

  // Retry: laporan status OTA tidak boleh hilang diam-diam (sekali gagal = job
  // nyangkut di dashboard). Coba maks 3x selang 500 ms; berhenti saat terkirim.
  for (int attempt = 1; attempt <= 3; attempt++) {
    int httpCode = http.POST(payload);
    if (httpCode > 0) {
      Serial.printf("[OTA STATUS] Terkirim ke server (HTTP %d, percobaan %d)\n", httpCode, attempt);
      break;
    }
    Serial.printf("[OTA STATUS] Gagal terkirim (percobaan %d/3): %s\n",
                  attempt, http.errorToString(httpCode).c_str());
    if (attempt < 3) delay(500);
  }
  http.end();
}
