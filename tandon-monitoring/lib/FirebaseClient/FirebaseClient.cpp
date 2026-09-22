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
  http.addHeader("X-API-KEY", LOCAL_API_TOKEN);
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
}

String FirebaseClient::readCommand(const String &kodeNode, const String &key) {
  // Dalam arsitektur lokal, pengecekan OTA ditangani langsung oleh OtaUpdater via HTTP
  return "";
}

void FirebaseClient::clearCommand(const String &kodeNode, const String &key) {
  // No-op pada server lokal
}

void FirebaseClient::updateOtaStatus(const String &kodeNode, const String &status, int progress, const String &error) {
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
  http.addHeader("X-API-KEY", LOCAL_API_TOKEN);
  http.addHeader("ngrok-skip-browser-warning", "true");

  String payload = "{";
  payload += "\"kode_node\":\"" + kodeNode + "\",";
  payload += "\"status\":\"" + status + "\",";
  payload += "\"progress_percent\":" + String(progress);
  if (error.length() > 0) {
    String escError = error;
    escError.replace("\"", "\\\"");
    payload += ",\"error_message\":\"" + escError + "\"";
  }
  payload += "}";

  http.POST(payload);
  http.end();
}
