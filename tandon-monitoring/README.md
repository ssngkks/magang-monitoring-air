# Tandon Monitoring - PlatformIO Project

Satu workspace PlatformIO di Visual Studio Code untuk 2 firmware ESP32:
- **`node_sensor`** (ESP32 #1) — Membaca seluruh sensor fisik (pH kalibrasi Claude di GPIO 32, Ultrasonic 200cm, Turbidity, DHT22, Getaran, MPU6050) dan mengirimkan data mentah via LoRa. **Tanpa AI**, sangat ringan & hemat daya.
- **`gateway`** (ESP32 #2) — Menerima LoRa, **menjalankan Edge AI TinyML 5-Tree Ensemble secara lokal**, sinkronisasi ke Firebase (`/sensor/latest` & `/sensor/history`), mengirim notifikasi cerdas Telegram, dan menangani update OTA.

---

## Cara Kompilasi & Upload di VS Code

### Menggunakan PlatformIO CLI
```bash
# Build & Flash ESP32 #1 (Node Sensor)
pio run -e node_sensor -t upload -t monitor

# Build & Flash ESP32 #2 (Gateway)
pio run -e gateway -t upload -t monitor
```
*(Atau gunakan tombol Alien PlatformIO di sidebar VS Code, lalu pilih Project Tasks -> node_sensor / gateway -> Upload & Monitor)*

---

## Konfigurasi Pin & Hardware

### 1. ESP32 #1 (Node Sensor)
| Komponen | Pin ESP32 | Catatan |
|---|---|---|
| LoRa SX1278 SCK | GPIO 18 | SPI Default |
| LoRa SX1278 MISO | GPIO 19 | SPI Default |
| LoRa SX1278 MOSI | GPIO 23 | SPI Default |
| LoRa SX1278 CS / NSS | GPIO 5 | Chip Select |
| LoRa SX1278 RST | GPIO 27 | Reset |
| LoRa SX1278 DIO0 | GPIO 26 | Interrupt Paket |
| Sensor pH (PH-4502C) | **GPIO 32** | Kalibrasi Piecewise Claude (Neutral ADC 1551) |
| Ultrasonic AJ-SR04M TRIG | GPIO 14 | Trigger pulsa |
| Ultrasonic AJ-SR04M ECHO | GPIO 34 | Echo input (Max 200 cm) |
| Sensor Turbidity | GPIO 33 | ADC1_CH6 |
| Sensor DHT22 | GPIO 4 | Suhu & Kelembapan |
| Sensor Getaran Pompa | GPIO 25 | INPUT_PULLUP, ISR CHANGE |
| Sensor MPU6050 (Opsional) | SDA 21, SCL 22 | Auto-detect bus I2C (0x68) |

### 2. ESP32 #2 (Gateway)
| Komponen | Pin ESP32 | Catatan |
|---|---|---|
| LoRa SCK, MISO, MOSI | GPIO 18, 19, 23 | SPI |
| LoRa CS, RST, DIO0 | GPIO 5, 27, 26 | LoRa Control |
| WiFi | Internal ESP32 | Terkoneksi ke Internet |

---

## Kalibrasi pH (Claude)
Sensor pH dihubungkan ke **GPIO 32** dengan rumus kalibrasi berbasis ADC langsung dari Claude:
- **Netral (pH 7.00)**: ADC 1551
- **Asam (pH 4.01)**: ADC 1790 (Slope = `79.93` ADC/pH)
  $$\text{pH} = 7.00 - \frac{\text{adc} - 1551.0}{79.93}$$
- **Basa (pH 9.00)**: ADC 1285 (Slope = `133.00` ADC/pH)
  $$\text{pH} = 7.00 + \frac{1551.0 - \text{adc}}{133.00}$$
- Nilai di-clamp antara `0.0` sampai `14.0`.

---

## Edge AI TinyML (Hanya di Gateway ESP32 #2)
Gateway mengeksekusi model klasifikasi multivariat 5-Tree Ensemble lokal (<35 µs):
1. **Tree 1 (Chemical)**: pH dan Kekeruhan (Standar WHO / Permenkes).
2. **Tree 2 (Physical)**: Level air tandon (Deteksi kritis & overflow).
3. **Tree 3 (Thermal)**: Suhu air dan lingkungan.
4. **Tree 4 (Mechanical)**: Pulsa getaran pompa (Deteksi dry-run & kavitasi).
5. **Tree 5 (Holistic)**: Interaksi silang multi-parameter.

**Output AI**:
- Kelas: `Normal`, `Anomali`, `Bahaya`.
- Confidence (%) dan Rekomendasi Tindakan Teknis.

---

## Integrasi Website (`Website-monitoring`)
Gateway mengirim format JSON yang 100% kompatibel ke Firebase Realtime Database:
```json
{
  "getaran": 0,
  "ketinggian_air": 145.2,
  "turbidity": 12,
  "ph": 7.12,
  "suhu": 28.5,
  "kelembapan": 65.0,
  "rssi": -45,
  "snr": 9.25,
  "ai_status": "Normal",
  "ai_confidence": 98.2,
  "ai_diagnosis": "Kualitas air aman, operasional optimal"
}
```
Website Laravel secara otomatis membaca `/sensor/latest` dan menyinkronkan data ini ke Cloud Firestore & Dashboard React.
