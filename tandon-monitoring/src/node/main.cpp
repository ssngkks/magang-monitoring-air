// ============================================================
// NODE SENSOR (ESP32 #1)
// Membaca seluruh sensor fisik tandon air -> kirim via LoRa ke Gateway.
// CATATAN: Edge AI TIDAK dijalankan di sini (dipindahkan ke Gateway ESP32 #2).
// ============================================================
#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>
#include <Wire.h>

#include "SensorManager.h"
#include "I2CSensorRegistry.h"
#include "LoraProtocol.h"

#include "UltrasonicSensor.h"
#include "TurbiditySensor.h"
#include "PHSensor.h"
#include "DHTSensor.h"
#include "VibrationSensor.h"
#include "LoraFuotaNode.h"
#include "secrets.h"

LoraFuotaNode fuotaNode(KODE_NODE);


// ================== PIN LORA (JANGAN DIUBAH) ==================
#define LORA_SCK   18
#define LORA_MISO  19
#define LORA_MOSI  23
#define LORA_CS    5
#define LORA_RST   27
#define LORA_DIO0  26
#define LORA_FREQ  923E6

// ================== PIN SENSOR FISIK ==================
#define VIBRATION_SENSOR_PIN 25
#define DHT_PIN              4
#define DHT_TYPE             DHT22
#define TRIG_PIN             14
#define ECHO_PIN             34
#define TURBIDITY_PIN        33   // ADC1_CH6, input only
#define PH_PIN               32   // ADC1_CH7, input only (Kalibrasi Claude)
#define MAX_HEIGHT           100  // tinggi wadah maksimum (cm)

// ================== INTERVAL NON-BLOCKING ==================
#define SENSOR_READ_INTERVAL 2000
#define LORA_SEND_INTERVAL   3000

// Watchdog pengiriman: bila tidak ada TX LoRa sukses selama ini, node restart
// sendiri (anti-diam total; tidak berlaku saat FUOTA karena update butuh waktu).
#define TX_WATCHDOG_MS 300000UL // 5 menit

// LED onboard untuk heartbeat fisik (kedip tiap TX sukses).
#ifndef LED_PIN
#define LED_PIN 2
#endif
#define LED_BLINK_MS 120

SensorManager sensors;
bool loraReady = false;
unsigned long lastSensorRead = 0;
unsigned long lastLoraSend = 0;
unsigned long lastSuccessfulTx = 0;

// ============================================================
// DAFTAR SENSOR
// ============================================================
void registerSensors() {
  sensors.add(new UltrasonicSensor(TRIG_PIN, ECHO_PIN, MAX_HEIGHT));
  sensors.add(new TurbiditySensor(TURBIDITY_PIN));
  sensors.add(new PHSensor(PH_PIN)); // Menggunakan kalibrasi piecewise Claude (1551 neutral)
  sensors.add(new DHTSensor(DHT_PIN, DHT_TYPE));
  sensors.add(new VibrationSensor(VIBRATION_SENSOR_PIN));

  // Sensor I2C (MPU6050 dsb.) dideteksi & didaftarkan otomatis jika terpasang
  autoDetectI2CSensors(sensors);
}

void printSerialStatus() {
  float waterLevel        = sensors.get("AIR").values[0];
  int   turbidity         = (int)sensors.get("TURBID").values[0];
  float ph                = sensors.get("PH").values[0];
  float temperature       = sensors.get("DHT").values[0];
  float humidity          = sensors.get("DHT").values[1];
  unsigned long vibration = (unsigned long)sensors.get("GETARAN").values[0];

  Serial.println("========================================");
  Serial.println("LORA 1 - NODE SENSOR - STATUS V1.0.2");
  Serial.println("========================================");
  Serial.printf("GETARAN POMPA     : %lu pulsa\n", vibration);
  Serial.printf("KETINGGIAN AIR    : %.1f cm (Max: %d cm)\n", waterLevel, MAX_HEIGHT);
  Serial.printf("TURBIDITY         : %d NTU (%s)\n", turbidity, (turbidity <= 50) ? "Jernih" : "Keruh");
  Serial.printf("pH AIR (Claude)   : %.2f (%s)\n", ph, (ph < 6.5) ? "Asam" : (ph > 8.5) ? "Basa" : "Normal");
  Serial.printf("SUHU              : %.1f C\n", temperature);
  Serial.printf("KELEMBAPAN        : %.1f %%\n", humidity);

  if (sensors.isOnline("MPU")) {
    SensorReading mpu = sensors.get("MPU");
    Serial.printf("MPU6050 ACC       : X=%.2f Y=%.2f Z=%.2f m/s2\n", mpu.values[0], mpu.values[1], mpu.values[2]);
    Serial.printf("MPU6050 GYRO      : X=%.1f Y=%.1f Z=%.1f rad/s\n", mpu.values[3], mpu.values[4], mpu.values[5]);
  }

  Serial.printf("STATUS LORA       : %s\n", loraReady ? "SIAP" : "GAGAL");
  Serial.println("========================================\n");
}

// Versi firmware node (dilaporkan saat hello + penolak ANNOUNCE versi sama).
// WAJIB di-bump setiap rilis binary node baru agar penjaga anti-flash-ulang akurat.
#ifndef NODE_FW_VERSION
#define NODE_FW_VERSION "v1.0.2"
#endif

void sendLoraData() {
  if (!loraReady) {
    Serial.println("LORA TIDAK SIAP, DATA TIDAK DIKIRIM");
    return;
  }

  String payload = LoraProtocol::encode(sensors);

  LoRa.beginPacket();
  LoRa.print(payload);
  bool sent = LoRa.endPacket();

  Serial.print("LORA DIKIRIM      : ");
  Serial.println(sent ? "BERHASIL" : "GAGAL");
  Serial.print("PAYLOAD           : ");
  Serial.println(payload);
  Serial.println();

  if (sent) {
    lastSuccessfulTx = millis();
    // Heartbeat fisik: kedip LED tiap transmisi sukses.
    digitalWrite(LED_PIN, HIGH);
    delay(LED_BLINK_MS);
    digitalWrite(LED_PIN, LOW);
  }
}

// Paket pengumuman kapabilitas ke gateway (audit.md §5/§6).
// MPU6050 hanya diumumkan bila probe I2C menemukannya (§6.3).
void sendHelloPacket() {
  if (!loraReady) return;

  bool mpuPresent = sensors.isOnline("MPU");
  String payload = LoraProtocol::encodeHello(NODE_FW_VERSION, mpuPresent);

  LoRa.beginPacket();
  LoRa.print(payload);
  bool sent = LoRa.endPacket();

  Serial.print("HELLO DIKIRIM     : ");
  Serial.println(sent ? "BERHASIL" : "GAGAL");
  Serial.print("PAYLOAD           : ");
  Serial.println(payload);
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  delay(200);

  Serial.println("========================================");
  Serial.println("LORA 1 - NODE SENSOR - INISIALISASI");
  Serial.println("========================================");

  Wire.begin(); // bus I2C default ESP32 (SDA=21, SCL=22)
  Wire.setTimeOut(50); // Mencegah I2C hang selamanya

  registerSensors();
  sensors.beginAll();

  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_CS);
  LoRa.setPins(LORA_CS, LORA_RST, LORA_DIO0);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  loraReady = LoRa.begin(LORA_FREQ);
  Serial.println(loraReady ? "STATUS LORA       : OK" : "STATUS LORA       : GAGAL");
  fuotaNode.begin();
  fuotaNode.setRunningVersion(NODE_FW_VERSION);
  Serial.printf("FIRMWARE BERJALAN  : %s\n", NODE_FW_VERSION);

  // Sinyal hidup 3x kedip saat boot + acuan awal watchdog.
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(150);
    digitalWrite(LED_PIN, LOW);
    delay(150);
  }
  lastSuccessfulTx = millis();
  Serial.println("STATUS FUOTA LORA : SIAP MENERIMA OTA TANPA KABEL");
  Serial.println("========================================\n");

  // Umumkan identitas + kapabilitas ke gateway (diteruskan sebagai HTTP hello).
  if (loraReady) {
    delay(300); // beri waktu gateway siap menerima
    sendHelloPacket();
  }
}

void loop() {
  // 1. Cek paket LoRa masuk (FUOTA chunk / announce dari Gateway)
  int packetSize = LoRa.parsePacket();
  if (packetSize > 0) {
    fuotaNode.processPacket(packetSize);
  }
  fuotaNode.tick();

  // Jika sedang dalam proses update OTA via LoRa, hentikan sementara transmisi sensor
  if (fuotaNode.isUpdating()) {
    delay(5);
    return;
  }

  unsigned long now = millis();

  // Re-inisialisasi otomatis jika modul LoRa sempat gagal terdeteksi saat startup
  if (!loraReady) {
    static unsigned long lastLoraRetry = 0;
    if (now - lastLoraRetry >= 10000UL) {
      lastLoraRetry = now;
      Serial.println("[LoRa Node] Mencoba re-inisialisasi modul LoRa...");
      loraReady = LoRa.begin(LORA_FREQ);
      if (loraReady) {
        Serial.println("[LoRa Node] Re-inisialisasi LoRa BERHASIL!");
      }
    }
  }

  // Baca sensor dengan interval berkala non-blocking (mencegah CPU starvation dari ultrasonic & DHT)
  if (now - lastSensorRead >= SENSOR_READ_INTERVAL) {
    lastSensorRead = now;
    sensors.readAll();
    printSerialStatus();
  }

  if (now - lastLoraSend >= LORA_SEND_INTERVAL) {
    lastLoraSend = now;
    sendLoraData();
  }

  // Watchdog pengiriman: diam >5 menit (bukan saat FUOTA) = ada yang salah,
  // restart agar node tidak perlu dicabut manual. Diagnosis via Serial/UI tetap ada.
  // PENTING: pakai millis() segar — variabel now() di atas basi (dicatat sebelum
  // sendLoraData), sehingga now - lastSuccessfulTx underflow unsigned dan
  // me-reboot node setiap ada kiriman sukses (bug loop terkonfirmasi).
  if (!fuotaNode.isUpdating() && loraReady && (millis() - lastSuccessfulTx >= TX_WATCHDOG_MS)) {
    Serial.println("[WATCHDOG] Tidak ada transmisi LoRa sukses >5 menit. Restart node...");
    delay(300);
    ESP.restart();
  }

  delay(5); // Yield ke FreeRTOS IDLE task untuk mencegah watchdog timeout
}

