// ============================================================
// GATEWAY (ESP32 #2)
// Menerima paket LoRa dari Node Sensor -> Menjalankan Edge AI TinyML lokal
// -> Mengirim data ke Firebase Realtime Database & Alert Telegram.
// ============================================================
#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>
#include <WiFi.h>

#include "secrets.h"
#include "WaterQualityAI.h"
#include "LoraProtocol.h"
#include "FirebaseClient.h"
#include "TelegramNotifier.h"
#include "OtaUpdater.h"

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
#define OTA_CHECK_INTERVAL         900000UL  // Cek update OTA otomatis tiap 15 menit (15 * 60 * 1000 ms)

WaterQualityAI waterAI;

int rssi = 0;
float snr = 0;

unsigned long lastTelegramTime = 0;
String lastTelegramStatus = "Normal";
unsigned long lastWiFiCheck = 0;
unsigned long lastHistoryUpload = 0;
unsigned long lastOtaCheck = 0;
unsigned long lastCommandCheck = 0;  // Interval cek command (force OTA dll) dari Firebase
bool wifiConnected = false;

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

  String icon = (ai.classId == AI_BAHAYA) ? "🚨 *BAHAYAA, HIDUP JOKOWI!!!!!*\n\n"
              : (ai.classId == AI_ANOMALI) ? "⚠️ *WARNING, IYHH AJH*\n\n"
                                            : "✅ *NORMAL, YAUDAH SIH😂*\n\n";

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

  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_CS);
  LoRa.setPins(LORA_CS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("STATUS LORA       : GAGAL - periksa modul LoRa!");
    while (true) delay(1000);
  }

  Serial.println("STATUS LORA       : SIAP");
  OtaUpdater::begin();
  Serial.println("MENUNGGU DATA DARI NODE SENSOR (ESP32 #1)...");
  Serial.println("========================================\n");
}


// ============================================================
// LOOP
// ============================================================
void loop() {
  checkWiFi();

  // Cek update OTA berkala di background (tiap 1 jam)
  if (wifiConnected && millis() - lastOtaCheck >= OTA_CHECK_INTERVAL) {
    lastOtaCheck = millis();
    OtaUpdater::checkForUpdate();
  }

  // Cek command "Force OTA Check Sekarang" dari Firebase RTDB (tiap 3 detik)
  // Website menulis /commands/{kode}/ota_force_check = true
  // untuk memicu cek OTA segera tanpa menunggu interval berkala
  if (wifiConnected && millis() - lastCommandCheck >= 3000UL) {
    lastCommandCheck = millis();
    String forceFlagNode = FirebaseClient::readCommand(KODE_NODE, "ota_force_check");
    String forceFlagGw   = (String(GATEWAY_ID) != String(KODE_NODE)) ? FirebaseClient::readCommand(GATEWAY_ID, "ota_force_check") : "";

    if (forceFlagNode == "true" || forceFlagGw == "true" || forceFlagNode == "1" || forceFlagGw == "1") {
      Serial.println("\n[COMMAND] Tombol Upgrade Instan diterima dari website! Memeriksa pembaruan sekarang...");
      FirebaseClient::clearCommand(KODE_NODE, "ota_force_check");
      if (String(GATEWAY_ID) != String(KODE_NODE)) {
        FirebaseClient::clearCommand(GATEWAY_ID, "ota_force_check");
      }
      lastOtaCheck = millis(); // reset timer
      OtaUpdater::checkForUpdate();
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
