#include "FirebaseClient.h"
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include "certs.h"
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
// Blueprint §3.2/§3.3/§3.5: TLS terverifikasi + token unik per-device (NVS).
// =========================================================================

// Provisioning key awal (audit.md §7): HANYA untuk hello pertama.
// Setelah hello sukses, backend mengembalikan token unik yang disimpan di NVS
// dan dipakai untuk semua request berikutnya. JANGAN hardcode token permanen.
#if !defined(DEVICE_KEY) && defined(LOCAL_API_TOKEN)
#define DEVICE_KEY LOCAL_API_TOKEN
#endif
#ifndef DEVICE_KEY
#define DEVICE_KEY "prototipe-shared-key-ganti-ini"
#endif

// ---------- NVS token unik per-device (blueprint §3.3) ----------
static Preferences sPrefs;
static bool sPrefsBegun = false;

void FirebaseClient::initPreferences() {
  if (!sPrefsBegun) {
    sPrefs.begin("watermon", false);
    sPrefsBegun = true;
  }
}

String FirebaseClient::getDeviceToken() {
  initPreferences();
  // Cek isKey dulu: getString() pada key yang belum ada men-spam log error
  // "nvs_get_str len fail: NOT_FOUND" tiap ±15 detik (normal saat NVS kosong
  // sebelum hello pertama sukses — bukan kerusakan).
  if (!sPrefs.isKey("dev_token")) {
    return "";
  }
  return sPrefs.getString("dev_token", "");
}

void FirebaseClient::setDeviceToken(const String &token) {
  initPreferences();
  if (token.length() == 0) {
    sPrefs.remove("dev_token");
  } else {
    sPrefs.putString("dev_token", token);
  }
}

// Kunci auth efektif: token unik NVS bila sudah ada, kalau belum pakai
// provisioning DEVICE_KEY (hello pertama). Tidak pernah mengirim keduanya.
static String activeAuthKey() {
  FirebaseClient::initPreferences();
  String t = FirebaseClient::getDeviceToken(); // isKey-guarded, tanpa spam log
  t.trim();
  if (t.length() >= 16) return t;
  return String(DEVICE_KEY);
}

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

// Konfigurasi TLS (di-gate compile-time, blueprint susulan simplify-crypto):
// - Env secure (FEATURE_TLS_PINNING nyala): HTTPS diverifikasi via pin CA
//   (custom CA bila diisi, kalau tidak root CA publik). BUKAN setInsecure().
// - Env default (flag mati): HTTPS pakai setInsecure() — keputusan SADAR untuk
//   fase prototipe LAN tertutup (hemat flash tanpa kode verifikasi). Telegram
//   TIDAK ikut flag ini (tetap pin DigiCert — domain publik, beda kelas risiko).
// - HTTP LAN lokal: tanpa TLS di kedua mode (sadar & didokumentasikan).
static void beginHttp(HTTPClient &http, const String &url, WiFiClient &plain, WiFiClientSecure &sec) {
  bool isHttps = url.startsWith("https://");
  if (isHttps) {
#ifdef FEATURE_TLS_PINNING
    // Pakai custom CA bila diisi (server lokal HTTPS self-signed), kalau tidak
    // pakai root CA publik (ngrok/Telegram/dll.).
    SecurityCerts::configureSecureClient(sec, LOCAL_SERVER_CA_CERT);
#else
    sec.setInsecure(); // Sadar: hanya untuk LAN tertutup fase prototipe
#endif
    sec.setTimeout(10);
    sec.setHandshakeTimeout(15);
    http.begin(sec, url);
  } else {
    http.begin(plain, url);
  }
}

static void addAuthHeaders(HTTPClient &http) {
  String key = activeAuthKey();
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");
  http.addHeader("User-Agent", "ESP32-Gateway");
  http.addHeader("X-Device-Key", key);   // auth utama: token unik per-device (§3.3)
  http.addHeader("X-API-KEY", key);      // kompatibilitas server lama
  http.addHeader("ngrok-skip-browser-warning", "true");
}

// Ambil field string sederhana dari JSON respons ("key":"value").
static String extractRespString(const String &json, const String &key) {
  String pat = "\"" + key + "\"";
  int idx = json.indexOf(pat);
  if (idx == -1) return "";
  int colon = json.indexOf(":", idx + pat.length());
  if (colon == -1) return "";
  int qs = json.indexOf("\"", colon);
  if (qs == -1) return "";
  int qe = json.indexOf("\"", qs + 1);
  if (qe == -1) return "";
  return json.substring(qs + 1, qe);
}

// POST JSON generik dengan dukungan http/https + auth header token unik.
static int postJson(const String &url, const String &payload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[LOCAL SERVER] WiFi tidak terhubung, request dibatalkan.");
    return -1;
  }

  HTTPClient http;
  http.setTimeout(10000);

  WiFiClient plainClient;
  plainClient.setTimeout(10);
  WiFiClientSecure secClient;
  beginHttp(http, url, plainClient, secClient);
  addAuthHeaders(http);

  int httpCode = http.POST(payload);
  http.end();
  return httpCode;
}

// POST JSON yang juga mengembalikan body (dipakai hello untuk ambil device_token).
static int postJsonWithBody(const String &url, const String &payload, String &bodyOut) {
  bodyOut = "";
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[LOCAL SERVER] WiFi tidak terhubung, request dibatalkan.");
    return -1;
  }
  HTTPClient http;
  http.setTimeout(10000);
  WiFiClient plainClient;
  plainClient.setTimeout(10);
  WiFiClientSecure secClient;
  beginHttp(http, url, plainClient, secClient);
  addAuthHeaders(http);
  int code = http.POST(payload);
  if (code > 0) bodyOut = http.getString();
  http.end();
  return code;
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

  WiFiClient plainClient;
  plainClient.setTimeout(10);
  WiFiClientSecure secClient;
  beginHttp(http, url, plainClient, secClient);
  addAuthHeaders(http);

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
// Blueprint §3.3: kirim token NVS bila sudah punya (hello ulang), kalau belum
// kirim provisioning DEVICE_KEY. Simpan device_token unik dari respons ke NVS.
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

  String keyToSend = activeAuthKey();
  String payload = "{";
  payload += "\"device_id\":\"" + deviceId + "\",";
  payload += "\"device_role\":\"" + deviceRole + "\",";
  payload += "\"device_key\":\"" + keyToSend + "\",";
  payload += "\"firmware_version\":\"" + firmwareVersion + "\",";
  payload += "\"hardware_id\":\"" + WiFi.macAddress() + "\",";
  payload += "\"ip_address\":\"" + WiFi.localIP().toString() + "\",";
  payload += "\"wifi_ssid\":\"" + WiFi.SSID() + "\",";
  payload += "\"wifi_channel\":" + String(WiFi.channel()) + ",";
  payload += "\"capabilities\":" + capsJson;
  payload += "}";

  String body;
  int httpCode = postJsonWithBody(url, payload, body);
  Serial.printf("[HELLO] %s (%s) -> HTTP %d\n", deviceId.c_str(), deviceRole.c_str(), httpCode);
  if (httpCode == 200 || httpCode == 202) {
    // Backend mengembalikan token unik SEKALI di field device_token (§3.3).
    // Simpan ke NVS agar hello/heartbeat/store berikutnya pakai token ini.
    String newToken = extractRespString(body, "device_token");
    newToken.trim();
    if (newToken.length() >= 16) {
      setDeviceToken(newToken);
      Serial.println("[HELLO] Token unik per-device tersimpan di NVS.");
    }
    return true;
  }
  return false;
}

// POST /api/devices/heartbeat — tiap ±15 detik (audit.md §5.6).
// Memakai token unik NVS (bukan provisioning), konsisten dengan verify.node.token.
bool FirebaseClient::sendHeartbeat(const String &deviceId) {
  String url = localBaseUrl() + "/api/devices/heartbeat";

  String payload = "{";
  payload += "\"device_id\":\"" + deviceId + "\",";
  payload += "\"device_key\":\"" + activeAuthKey() + "\",";
  payload += "\"uptime\":" + String(millis() / 1000UL) + ",";
  payload += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
  payload += "\"wifi_ssid\":\"" + WiFi.SSID() + "\",";
  payload += "\"wifi_channel\":" + String(WiFi.channel());
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

  WiFiClient plainClient;
  plainClient.setTimeout(10);
  WiFiClientSecure secClient;
  beginHttp(http, url, plainClient, secClient);
  addAuthHeaders(http);

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
