// ============================================================
// GATEWAY (ESP32 #2)
// Menerima paket LoRa dari Node Sensor -> Menjalankan Edge AI TinyML lokal
// -> Mengirim data ke Laravel lokal (MySQL) & Alert Telegram.
// Alur lifecycle: hello saat boot, heartbeat tiap 15 dtk (audit.md §5).
// ============================================================
#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>
#include <WiFi.h>

#include "secrets.h"
#include "WaterQualityAI.h"
#include "LoraProtocol.h"
#include "LoraSecure.h"
#include "FirebaseClient.h"
#include "TelegramNotifier.h"
#include "OtaUpdater.h"
#include <Preferences.h>

#ifndef LORA_AUTH_KEY
#define LORA_AUTH_KEY "lora-secret-key-32-bytes-auth!"
#endif
#ifndef LORA_STRICT_AUTH
#define LORA_STRICT_AUTH 0  // 0 = terima legacy dengan peringatan (migrasi); 1 = tolak legacy
#endif

// ================== PIN LORA (JANGAN DIUBAH) ==================
#define LORA_SCK   18
#define LORA_MISO  19
#define LORA_MOSI  23
#define LORA_CS    5
#define LORA_RST   27
#define LORA_DIO0  26
#define LORA_FREQ  923E6

// ================== AMBANG BATAS ALERT ==================
#define VIBRATION_ALERT     20
#define WATER_LEVEL_ALERT   80
#define TURBIDITY_ALERT     50
#define PH_MIN_NORMAL       6.5
#define PH_MAX_NORMAL       8.5
#define TEMP_ALERT          40

// ================== INTERVAL ==================
#define TELEGRAM_INTERVAL          120000UL  // 2 menit cooldown spam Telegram
#define FIREBASE_HISTORY_INTERVAL  30000UL   // 30 detik interval log history
#define OTA_CHECK_INTERVAL         60000UL   // Cek manifest OTA tiap 60 detik (LAN; bikin "force check" nyaris instan)
#define HEARTBEAT_INTERVAL         15000UL   // Heartbeat ke Laravel tiap ±15 detik (audit.md §5.6)
#define HELLO_REFRESH_INTERVAL     1800000UL // Segarkan hello node tiap 30 menit (bila HELLO LoRa terlewat)
#define NODE_SILENCE_WARN_MS       300000UL  // Peringatkan bila node sepi >5 menit
#define NODE_SILENCE_WARN_REPEAT_MS 60000UL  // Ulangi peringatan tiap 60 detik selama sepi

#ifndef CURRENT_FW_VERSION
#define CURRENT_FW_VERSION "v1.0.2"
#endif

// Kapabilitas gateway sesuai audit.md §5.2
#define GATEWAY_CAPABILITIES "lora_rssi,lora_snr,ai_status"
// Kapabilitas bawaan node bila paket HELLO LoRa tak pernah diterima
#define NODE_DEFAULT_CAPABILITIES "ph,turbidity,water_level,temperature,humidity,vibration"

WaterQualityAI waterAI;

int rssi = 0;
float snr = 0;

unsigned long lastTelegramTime = 0;
String lastTelegramStatus = "Normal";
unsigned long lastWiFiCheck = 0;
unsigned long lastHistoryUpload = 0;
unsigned long lastOtaCheck = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastNodePacketTime = 0;
unsigned long lastNodeWarnTime = 0;
bool wifiConnected = false;
bool gatewayHelloSent = false;

// Cache hello node terakhir yang diteruskan ke Laravel (prototipe: 1 node aktif).
// lastNodeFw dimuat dari NVS agar reboot gateway tidak me-reset ke "1.0.0" dan
// menimpa firmware_version DB yang sudah benar (bug flip 1.0.0). String kosong
// = belum pernah dengar HELLO asli (jangan karang versi).
String lastNodeHelloId = "";
String lastNodeCaps = "";
String lastNodeFw = "";
unsigned long lastNodeHelloTime = 0;
static void loadNodeFw() {
  Preferences p;
  if (p.begin("gw", true)) {
    lastNodeFw = p.getString("node_fw", "");
    p.end();
  }
  lastNodeFw.trim();
}
static void saveNodeFw(const String &v) {
  String t = v;
  t.trim();
  if (t.length() == 0 || t == lastNodeFw) return;
  lastNodeFw = t;
  Preferences p;
  if (p.begin("gw", false)) {
    p.putString("node_fw", t);
    p.end();
  }
}

// Blueprint §3.1: anti-replay LoRa — nonce terakhir per pengirim.
// Prototipe single-node: satu variabel (jangan refactor ke map multi-node di
// task ini, sesuai §2 out-of-scope). Disimpan di NVS agar replay lama tetap
// ditolak setelah gateway reboot.
static uint32_t lastRxNonce = 0;
static bool rxNonceLoaded = false;
static void loadRxNonce() {
  if (rxNonceLoaded) return;
  Preferences p;
  if (p.begin("lora_rx", true)) { lastRxNonce = p.getUInt("last_rx", 0); p.end(); }
  rxNonceLoaded = true;
}
static void saveRxNonce(uint32_t n) {
  lastRxNonce = n;
  Preferences p;
  if (p.begin("lora_rx", false)) { p.putUInt("last_rx", n); p.end(); }
}

// Diagnostik AUTH-MISMATCH (tambahan blueprint susulan): bedakan tiga kondisi
// yang sekilas mirip tapi penanganannya beda total —
//  (a) node benar-benar senyap (tidak ada paket radio masuk),
//  (b) paket masuk tapi DITOLAK karena auth mismatch (node plain + gateway strict),
//  (c) paket masuk dan DITERIMA.
// lastNodePacketTime HANYA di-update untuk (c), sehingga (b) tidak menyamar
// jadi (c). Counter mismatch + ringkasan berkala memudahkan diagnosis salah
// pilih env saat build ulang (bukan masalah kabel/power).
static unsigned long lastRejectedPacketTime = 0;
static unsigned long lastMismatchSummaryTime = 0;
static uint32_t authMismatchCount = 0;
static uint32_t lastMismatchMismatchCount = 0; // untuk ringkasan delta
#define MISMATCH_SUMMARY_INTERVAL_MS 60000UL

// ============================================================
// WIFI
// ============================================================
void connectWiFi() {
  Serial.println("========================================");
  Serial.println("MENGHUBUNGKAN KE WIFI...");
  Serial.println("========================================");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < 20) {
    delay(500);
    Serial.print(".");
    attempt++;
  }

  wifiConnected = (WiFi.status() == WL_CONNECTED);
  if (wifiConnected) {
    Serial.println("\nWIFI: TERHUBUNG");
    Serial.print("IP ADDRESS: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWIFI: GAGAL TERHUBUNG (akan mencoba otomatis di background)");
  }
}

void checkWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    wifiConnected = false;
    if (millis() - lastWiFiCheck > 10000) {
      lastWiFiCheck = millis();
      Serial.println("WIFI TERPUTUS - MENYAMBUNG ULANG...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  } else {
    wifiConnected = true;
  }
}

// ============================================================
// CEK APAKAH ADA KONDISI ALERT
// ============================================================
bool isAlertCondition(float ph, int turbidity, float waterLevel, float temp,
                      unsigned long vibration, AIClass aiClass) {
  bool vibrationAlert = (vibration >= VIBRATION_ALERT);
  bool waterAlert     = (waterLevel >= WATER_LEVEL_ALERT);
  bool turbidityAlert = (turbidity >= TURBIDITY_ALERT);
  bool phAlert        = (ph < PH_MIN_NORMAL || ph > PH_MAX_NORMAL);
  bool tempAlert      = (temp >= TEMP_ALERT);
  bool aiAlert        = (aiClass == AI_BAHAYA);
  return vibrationAlert || waterAlert || turbidityAlert || phAlert || tempAlert || aiAlert;
}

// ============================================================
// NOTIFIKASI TELEGRAM BERBASIS EDGE AI
// ============================================================
void checkTelegramAlert(float ph, int turbidity, float temp, float waterLevel,
                        unsigned long vibration, const AIResult &ai) {
  String currentStatus = String(ai.status);

  bool isTransition         = (currentStatus != lastTelegramStatus);
  bool isNewAnomalyOrDanger = isTransition && (ai.classId != AI_NORMAL);
  bool isEscalation         = (lastTelegramStatus == "Anomali" && ai.classId == AI_BAHAYA);
  bool isRecovery           = isTransition && (ai.classId == AI_NORMAL) && (lastTelegramStatus != "Normal");
  bool isCooldownExpired    = (millis() - lastTelegramTime >= TELEGRAM_INTERVAL);

  bool shouldSend = isNewAnomalyOrDanger || isEscalation || isRecovery ||
                    (ai.classId != AI_NORMAL && isCooldownExpired);
  if (!shouldSend) return;

  lastTelegramTime = millis();
  lastTelegramStatus = currentStatus;

  // Rekomendasi tindakan teknis berbasis diagnosis AI
  String rekomendasi;
  if (ai.classId == AI_BAHAYA) {
    if (waterLevel < 10.0 || vibration >= 20) {
      rekomendasi = "SEGERA matikan pompa air! Terdeteksi risiko pompa berputar kering (dry-run).";
    } else if (ph < 6.0 || ph > 9.0) {
      rekomendasi = "Hentikan konsumsi dan pengisian air! Tingkat keasaman melampaui batas aman mutu air minum.";
    } else if (turbidity >= 26) {
      rekomendasi = "Kuras endapan tandon segera! Terindikasi kontaminasi lumpur pekat.";
    } else {
      rekomendasi = "Hentikan operasional sistem dan lakukan inspeksi fisik langsung ke lokasi tandon air!";
    }
  } else if (ai.classId == AI_ANOMALI) {
    if (turbidity >= 6) {
      rekomendasi = "Air mulai keruh. Jadwalkan pembersihan saringan/filter tandon.";
    } else if (vibration >= 6) {
      rekomendasi = "Getaran mekanis pompa meningkat. Periksa kekencangan baut dudukan motor pompa.";
    } else if (waterLevel < 20.0) {
      rekomendasi = "Cadangan air tandon mulai menipis (<20 cm).";
    } else if (waterLevel > 85.0) {
      rekomendasi = "Ketinggian air hampir penuh. Pantau katup pelampung otomatis.";
    } else {
      rekomendasi = "Pantau tren parameter sensor secara berkala.";
    }
  } else {
    rekomendasi = "Seluruh parameter beroperasi dalam batas aman. Sistem berjalan optimal.";
  }

  String icon = (ai.classId == AI_BAHAYA) ? "🚨 *BAHAYA - Segera Periksa*\n\n"
              : (ai.classId == AI_ANOMALI) ? "⚠️ *WARNING*\n\n"
                                            : "✅ *NORMAL*\n\n";

  String message = icon;
  message += "*Lokasi:* Unit Sensor Tandon Utama\n";
  message += "*Sinyal LoRa:* RSSI " + String(rssi) + " dBm | SNR " + String(snr, 1) + " dB\n\n";
  message += "*DATA SENSOR (ESP32 #1):*\n";
  message += "1. pH Air: " + String(ph, 2) + " pH\n";
  message += "2. Kekeruhan: " + String(turbidity) + " NTU\n";
  message += "3. Suhu Air: " + String(temp, 1) + " °C\n";
  message += "4. Level Air: " + String(waterLevel, 1) + " cm\n";
  message += "5. Getaran Pompa: " + String(vibration) + " pulsa\n\n";
  message += "*ANALISIS AI (ESP32 #2):*\n";
  message += "1. Status: *" + currentStatus + "* (" + String(ai.confidence, 1) + "% Yakin)\n";
  message += "2. Diagnosis: " + String(ai.diagnosis) + "\n";
  message += "3. Latensi Inferensi: " + String(ai.inferenceUs) + " µs\n\n";
  message += "*REKOMENDASI:*\n" + rekomendasi;

  TelegramNotifier::send(message);
}

void printReceivedStatus(float waterLevel, int turbidity, float ph,
                         float temp, float hum, unsigned long vibration,
                         const AIResult &ai) {
  Serial.println();
  Serial.println("========================================");
  Serial.println("LORA 2 - GATEWAY - DATA DITERIMA & AI");
  Serial.println("========================================");
  Serial.printf("GETARAN           : %lu pulsa\n", vibration);
  Serial.printf("KETINGGIAN AIR    : %.1f cm\n", waterLevel);
  Serial.printf("TURBIDITY         : %d NTU\n", turbidity);
  Serial.printf("pH AIR            : %.2f\n", ph);
  Serial.printf("SUHU              : %.1f C\n", temp);
  Serial.printf("KELEMBAPAN        : %.1f %%\n", hum);
  Serial.printf("RSSI / SINR        : %d dBm / %.2f dB\n", rssi, snr);
  Serial.printf("AI STATUS    : %s (%.1f%% Yakin) [%lu us]\n", ai.status, ai.confidence, ai.inferenceUs);
  Serial.printf("DIAGNOSIS AI      : %s\n", ai.diagnosis);
  Serial.printf("WIFI STATUS       : %s\n", wifiConnected ? "TERHUBUNG" : "TIDAK TERHUBUNG");
  Serial.println("========================================");
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("========================================");
  Serial.println("LORA 2 - GATEWAY - INISIALISASI");
  Serial.println("========================================");

  connectWiFi();

  // Muat versi node terakhir dari NVS (anti flip 1.0.0 setelah reboot).
  loadNodeFw();

  // Sinkronisasi jam via NTP — WAJIB untuk validasi sertifikat TLS (Telegram
  // & backend HTTPS): tanpa ini jam berhenti di 1970 dan semua verifikasi X509
  // gagal (-9984) meski CA sudah benar. Zona WIB (UTC+7), tanpa DST.
  if (wifiConnected) {
    configTime(7 * 3600, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
    struct tm tmNow;
    int ntpTries = 0;
    while (ntpTries < 20 && (!getLocalTime(&tmNow) || tmNow.tm_year < (2024 - 1900))) {
      delay(500);
      Serial.print("*");
      ntpTries++;
    }
    if (getLocalTime(&tmNow) && tmNow.tm_year >= (2024 - 1900)) {
      Serial.printf("\nNTP: jam tersinkron (%04d-%02d-%02d %02d:%02d:%02d WIB)\n",
                    tmNow.tm_year + 1900, tmNow.tm_mon + 1, tmNow.tm_mday,
                    tmNow.tm_hour, tmNow.tm_min, tmNow.tm_sec);
    } else {
      Serial.println("\nNTP: GAGAL sinkron (HTTPS terverifikasi & Telegram mungkin gagal; HTTP LAN tetap jalan)");
    }
  }

  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_CS);
  LoRa.setPins(LORA_CS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("STATUS LORA       : GAGAL - periksa modul LoRa!");
    while (true) delay(1000);
  }

  Serial.println("STATUS LORA       : SIAP");
  OtaUpdater::begin();
  Serial.printf("FIRMWARE BERJALAN  : %s\n", CURRENT_FW_VERSION);
  Serial.println("MENUNGGU DATA DARI NODE SENSOR (ESP32 #1)...");
  Serial.println("========================================\n");

  // Umumkan diri ke Laravel (audit.md §5.1): sekali saat boot & WiFi connect.
  // Muncul sebagai "pending" di dashboard bila kode belum diregistrasi.
  if (wifiConnected) {
    gatewayHelloSent = FirebaseClient::sendHello(GATEWAY_ID, "gateway", CURRENT_FW_VERSION, GATEWAY_CAPABILITIES);
    lastHeartbeat = millis();
    lastNodePacketTime = millis();
    // Selesaikan laporan update sebelumnya yang terpotong reboot
    // (httpUpdate sukses me-reboot sendiri sebelum sempat melapor).
    OtaUpdater::reportPendingAfterReboot();
  }
}


// ============================================================
// LOOP
// ============================================================
void loop() {
  checkWiFi();

  // Cek update OTA berkala di background (manifest Laravel, tiap 60 detik).
  // Tombol "force check" di website dibaca lewat polling ini (tanpa Firebase).
  if (wifiConnected && millis() - lastOtaCheck >= OTA_CHECK_INTERVAL) {
    lastOtaCheck = millis();
    OtaUpdater::checkForUpdate();
  }

  // Heartbeat gateway tiap ±15 detik (audit.md §5.6). Belum hello → coba hello dulu.
  if (wifiConnected && millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    if (!gatewayHelloSent) {
      gatewayHelloSent = FirebaseClient::sendHello(GATEWAY_ID, "gateway", CURRENT_FW_VERSION, GATEWAY_CAPABILITIES);
    } else {
      FirebaseClient::sendHeartbeat(GATEWAY_ID);
    }
  }

  // Peringatan node sepi: gateway TIDAK BISA membangunkan node dari sini
  // (node memancar buta satu arah), jadi hanya laporkan + arahkan cek fisik.
  // Dashboard ikut menunjukkan STALE/OFFLINE via last_seen yang menua.
  // BEDAKAN dari [AUTH-MISMATCH]: peringatan ini artinya TIDAK ADA paket radio
  // masuk sama sekali (cek daya/kabel/LED). Kalau log [AUTH-MISMATCH] muncul
  // beriringan, itu artinya paket ADA tapi DITOLAK (salah env/strict) — JANGAN
  // cabut kabel dulu, samakan env build node & gateway.
  if (millis() - lastNodePacketTime >= NODE_SILENCE_WARN_MS &&
      millis() - lastNodeWarnTime >= NODE_SILENCE_WARN_REPEAT_MS) {
    lastNodeWarnTime = millis();
    unsigned long silentSec = (millis() - lastNodePacketTime) / 1000UL;
    if (authMismatchCount > 0 && millis() - lastRejectedPacketTime < NODE_SILENCE_WARN_MS) {
      Serial.printf("\n[PERINGATAN] Tidak ada paket LoRa DITERIMA selama %lu detik, TAPI ada %u paket DITOLAK auth baru-baru ini. Dugaan: env mismatch (node plain + gateway strict?) atau kunci beda. Cek log [AUTH-MISMATCH] di atas sebelum cek kabel/power.\n", silentSec, authMismatchCount);
    } else {
      Serial.printf("\n[PERINGATAN] Tidak ada paket LoRa dari node selama %lu detik! Cek daya/kabel USB ESP32 #1, LED-nya (harus kedip tiap ~3 detik), lalu lihat Serial node.\n", silentSec);
    }
  }


  // Jika Gateway sedang mentransmisikan FUOTA via LoRa ke Node,
  // tahan pemrosesan data sensor agar kanal radio LoRa tidak bertabrakan
  if (OtaUpdater::isFuotaBusy()) {
    delay(10);
    return;
  }

  int packetSize = LoRa.parsePacket();
  if (!packetSize) return;

  String receivedData = "";
  while (LoRa.available()) {
    receivedData += (char)LoRa.read();
  }
  // CATATAN: lastNodePacketTime TIDAK di-update di sini — hanya paket yang
  // DITERIMA (lolos verifikasi) boleh menyegarkan timer node-hidup. Paket yang
  // DITOLAK auth dicatat terpisah (lastRejectedPacketTime + counter) agar
  // kasus "node-plain + gateway-strict" tidak menyamar jadi "node terdengar".

  // Verifikasi HMAC + anti-replay SEBELUM parsing sensor.
  // - Env default (FEATURE_LORA_AUTH mati): kode HMAC tidak ter-compile,
  //   semua paket diterima sebagai plain (perilaku pra-hardening).
  // - Env secure (flag nyala): paket secured v1 diverifikasi lalu field auth
  //   di-strip; paket legacy diterima dengan peringatan bila LORA_STRICT_AUTH=0,
  //   DITOLAK dengan log [AUTH-MISMATCH] bila =1.
#ifdef FEATURE_LORA_AUTH
  {
    loadRxNonce();
    String loraKey = String(LORA_AUTH_KEY);
    uint32_t pktNonce = 0;
    LoraSecure::VerifyResult vr = LoraSecure::verifyAndStrip(receivedData, pktNonce, lastRxNonce, loraKey);
    if (vr == LoraSecure::AUTH_FAIL_HMAC) {
      lastRejectedPacketTime = millis();
      authMismatchCount++;
      Serial.printf("[LoRaSecure][AUTH-MISMATCH] DITOLAK: HMAC tidak valid (paket ke-%u). Kemungkinan kunci LoRa beda / paket palsu. BUKAN masalah kabel/power — paket radio DITERIMA tapi DITOLAK. Cek LORA_AUTH_KEY sama di kedua sisi.\n", authMismatchCount);
      return;
    } else if (vr == LoraSecure::AUTH_FAIL_REPLAY) {
      lastRejectedPacketTime = millis();
      authMismatchCount++;
      Serial.printf("[LoRaSecure][AUTH-MISMATCH] DITOLAK: replay nonce %u (terakhir %u, total ditolak %u). Paket lama direkam ulang — abaikan, bukan node mati.\n", pktNonce, lastRxNonce, authMismatchCount);
      return;
    } else if (vr == LoraSecure::AUTH_FAIL_FORMAT) {
      lastRejectedPacketTime = millis();
      authMismatchCount++;
      Serial.printf("[LoRaSecure][AUTH-MISMATCH] DITOLAK: format auth rusak (total ditolak %u). BUKAN node mati.\n", authMismatchCount);
      return;
    } else if (vr == LoraSecure::AUTH_OK_SECURED) {
      saveRxNonce(pktNonce);
      lastNodePacketTime = millis();
    } else {
      // AUTH_OK_LEGACY
      if (LORA_STRICT_AUTH) {
        lastRejectedPacketTime = millis();
        authMismatchCount++;
        Serial.printf("[LoRaSecure][AUTH-MISMATCH] DITOLAK paket legacy tanpa HMAC (total ditolak %u). Dugaan kuat: NODE build DEFAULT (plain) + GATEWAY build SECURE strict. Samakan env (keduanya default atau keduanya secure) atau set LORA_STRICT_AUTH=0 sementara. BUKAN masalah kabel/power/node mati — paket radio DITERIMA %d byte tapi DITOLAK.\n", authMismatchCount, receivedData.length());
        return;
      }
      Serial.println("[LoRaSecure] PERINGATAN: paket legacy tanpa HMAC diterima (masa transisi, STRICT=0).");
      lastNodePacketTime = millis();
    }
  }
#else
  // Mode default: tanpa verifikasi HMAC (hemat flash) — terima apa adanya.
  lastNodePacketTime = millis();
#endif

  // Ringkasan berkala bila penolakan auth terus terjadi — bedakan dari
  // peringatan "node tidak terdengar" di loop() yang artinya TIDAK ADA paket.
  if (authMismatchCount != lastMismatchMismatchCount &&
      millis() - lastMismatchSummaryTime >= MISMATCH_SUMMARY_INTERVAL_MS) {
    lastMismatchSummaryTime = millis();
    uint32_t delta = authMismatchCount - lastMismatchMismatchCount;
    lastMismatchMismatchCount = authMismatchCount;
    Serial.printf("[LoRaSecure][AUTH-MISMATCH] Ringkasan: %u paket ditolak dalam 60 dtk terakhir (total %u). Jika ini paket legacy + gateway STRICT, samakan env build. Jika HMAC salah terus, cek LORA_AUTH_KEY.\n", delta, authMismatchCount);
  }

  // Paket pengumuman kapabilitas dari node (audit.md §5): teruskan sebagai HTTP hello.
  if (receivedData.startsWith("HELLO:")) {
    String helloNode = LoraProtocol::extractFieldWithFallback(receivedData, "NODE:", "ID:");
    String helloCaps = LoraProtocol::extractCapabilities(receivedData);
    String helloFw = LoraProtocol::extractField(receivedData, "HELLO:");
    helloFw.trim();
    // Kosong = tidak diketahui: teruskan "" agar backend mempertahankan versi
    // DB (jangan karang "1.0.0" yang menimpa versi benar).
    if (helloCaps.length() == 0) helloCaps = NODE_DEFAULT_CAPABILITIES;
    Serial.println("[HELLO] Paket pengumuman dari node: " + helloNode + " caps=" + helloCaps);
    if (helloNode.length() > 0 && helloNode.length() < 3) {
      Serial.println("[HELLO] ID terlalu pendek, diduga noise — diabaikan, tidak diteruskan.");
    }
    if (wifiConnected && helloNode.length() >= 3) {
      if (FirebaseClient::sendHello(helloNode, "node", helloFw, helloCaps)) {
        lastNodeHelloId = helloNode;
        lastNodeCaps = helloCaps;
        saveNodeFw(helloFw); // persist agar reboot tak me-reset ke default
        lastNodeHelloTime = millis();
      }
    }
    return;
  }

  // Validasi integritas paket LoRa (harus memiliki parameter kunci)
  if ((receivedData.indexOf("AIR:") == -1 && receivedData.indexOf("WATER_LEVEL:") == -1) ||
      (receivedData.indexOf("TURBID:") == -1 && receivedData.indexOf("TURBIDITY:") == -1)) {
    Serial.println("PERINGATAN: Paket LoRa tidak lengkap/rusak, diabaikan.");
    return;
  }

  rssi = LoRa.packetRssi();
  snr  = LoRa.packetSnr();

  // Ekstraksi ID node pengirim secara dinamis (plug and play)
  String packetNodeId = LoraProtocol::extractFieldWithFallback(receivedData, "NODE:", "ID:");

  // Pastikan node pengirim sudah hello ke Laravel (§5.3): bila paket HELLO LoRa
  // terlewat (mis. gateway reboot belakangan), teruskan hello dari paket sensor
  // dengan kapabilitas default + mpu6050 bila payload memuat data MPU.
  // Anti-hantu: ID sampah ("0", noise LoRa ter-parse) tidak diteruskan —
  // hello backend juga menolak ID < 3 karakter.
  if (wifiConnected && packetNodeId.length() >= 3 &&
      (lastNodeHelloId != packetNodeId || millis() - lastNodeHelloTime >= HELLO_REFRESH_INTERVAL)) {
    String inferredCaps = NODE_DEFAULT_CAPABILITIES;
    if (receivedData.indexOf("ACC:") != -1) inferredCaps += ",mpu6050";
    if (FirebaseClient::sendHello(packetNodeId, "node", lastNodeFw, inferredCaps)) {
      lastNodeHelloId = packetNodeId;
      lastNodeCaps = inferredCaps;
      lastNodeHelloTime = millis();
    }
  }

  // Ekstraksi data sensor dengan dukungan alias fleksibel
  unsigned long vibration = (unsigned long)LoraProtocol::extractFieldWithFallback(receivedData, "GETARAN:", "VIBRATION:").toInt();
  float waterLevel        = LoraProtocol::extractFieldWithFallback(receivedData, "AIR:", "WATER_LEVEL:").toFloat();
  int turbidity           = LoraProtocol::extractFieldWithFallback(receivedData, "TURBID:", "TURBIDITY:").toInt();
  float ph                = LoraProtocol::extractField(receivedData, "PH:").toFloat();
  float temperature       = LoraProtocol::extractFieldWithFallback(receivedData, "SUHU:", "DHT_T:").toFloat();
  float humidity          = LoraProtocol::extractFieldWithFallback(receivedData, "HUM:", "DHT_H:").toFloat();

  // ==========================================================
  // INFERENSI EDGE AI TINYML (DIJALANKAN DI GATEWAY)
  // ==========================================================
  AIResult ai = waterAI.predict(ph, turbidity, temperature, waterLevel, vibration);

  // Tampilkan data & analisis AI ke Serial Monitor
  printReceivedStatus(waterLevel, turbidity, ph, temperature, humidity, vibration, ai);

  // ==========================================================
  // KIRIM DATA KE FIREBASE & WEBSITE
  // Format JSON diselaraskan 100% dengan Website-monitoring
  // ==========================================================
  String json = LoraProtocol::buildFirebaseJson(waterLevel, turbidity, ph, temperature,
                                               humidity, vibration, rssi, snr, ai, packetNodeId);


  // 1. Firebase Latest: diperbarui seketika tiap ada paket masuk
  FirebaseClient::sendLatest(json);

  // 2. Firebase History: disimpan tiap 30 detik atau jika ada anomali/bahaya
  bool alert = isAlertCondition(ph, turbidity, waterLevel, temperature, vibration, ai.classId);
  if (alert || millis() - lastHistoryUpload >= FIREBASE_HISTORY_INTERVAL) {
    lastHistoryUpload = millis();
    FirebaseClient::sendHistory(json);
  }

  // ==========================================================
  // NOTIFIKASI TELEGRAM
  // ==========================================================
  checkTelegramAlert(ph, turbidity, temperature, waterLevel, vibration, ai);
}
