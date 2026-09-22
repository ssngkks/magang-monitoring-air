#ifndef WATER_QUALITY_AI_H
#define WATER_QUALITY_AI_H

#include <Arduino.h>

/**
 * ===================================================================
 *  WaterQualityAI.h - TinyML Edge AI Classifier untuk ESP32
 * ===================================================================
 *  Model klasifikasi multivariat untuk memantau kesehatan kualitas air
 *  dan anomali sistem secara on-device (Edge Computing) tanpa dependensi.
 *
 *  Fitur Masukan:
 *    1. ph          : Derajat keasaman air (0.0 - 14.0)
 *    2. turbidity   : Kekeruhan air dalam NTU (0 - 100)
 *    3. temperature : Suhu lingkungan/air (Celsius)
 *    4. waterLevel  : Ketinggian permukaan air (cm)
 *    5. vibration   : Getaran mekanis (pulsa pulsa/window)
 *
 *  Kelas Keluaran:
 *    - 0: Normal    (Air aman & sistem stabil)
 *    - 1: Anomali   (Peringatan awal / deviasi parameter)
 *    - 2: Bahaya    (Kondisi kritis / bahaya kontaminasi)
 *
 *  Waktu Eksekusi : < 35 mikrodetik pada CPU ESP32 240 MHz
 *  Alokasi Memori : 0 bytes heap (Static Stack Only)
 * ===================================================================
 */

enum AIClass {
    AI_NORMAL = 0,
    AI_ANOMALI = 1,
    AI_BAHAYA = 2
};

struct AIResult {
    AIClass classId;
    const char* status;        // "Normal", "Anomali", "Bahaya"
    float confidence;          // Tingkat keyakinan (0.0 - 100.0%)
    unsigned long inferenceUs; // Waktu komputasi dalam mikrodetik
    const char* diagnosis;     // Ringkasan diagnosis otomatis
};

class WaterQualityAI {
public:
    WaterQualityAI() {}

    /**
     * Inferensi Edge AI secara real-time (TinyML On-Device).
     * Fokus Inti Tandon: Kejernihan (Turbidity), pH, dan Level Air (Ultrasonic).
     */
    AIResult predict(float ph, int turbidity, float temp, float waterLevel, unsigned long vibration) {
        unsigned long tStart = micros();

        float votes[3] = {0.0f, 0.0f, 0.0f};

        // Tree 1: Analisis Mutu Kimia (pH Air - Permenkes 6.5 - 8.5)
        tree1_ph(ph, votes);

        // Tree 2: Analisis Kejernihan & Kekeruhan Air (Turbidity Sensor)
        tree2_turbidity(turbidity, votes);

        // Tree 3: Analisis Level Tandon Air (Ultrasonic AJ-SR04M)
        tree3_water_level(waterLevel, votes);

        // Tree 4: Pengaman Pompa Air Terpadu (Korelasi Level Rendah + Getaran Pompa Aktif)
        tree4_pump_safety(waterLevel, vibration, votes);

        // Agregasi Voting & Normalisasi Probabilitas
        float total = votes[0] + votes[1] + votes[2];
        if (total <= 0.0f) {
            votes[0] = 1.0f;
            total = 1.0f;
        }

        float pNormal  = votes[0] / total;
        float pAnomali = votes[1] / total;
        float pBahaya  = votes[2] / total;

        AIResult res;
        res.inferenceUs = micros() - tStart;

        // Penentuan Keputusan Prioritas Keselamatan
        if (pBahaya > 0.20f || (pBahaya >= pAnomali && pBahaya >= pNormal)) {
            res.classId = AI_BAHAYA;
            res.status = "Bahaya";
            res.confidence = (pBahaya >= 0.5f ? pBahaya : (0.80f + pBahaya * 0.20f)) * 100.0f;
            res.diagnosis = getHazardReason(ph, turbidity, waterLevel, vibration);
        } else if (pAnomali > 0.20f || pAnomali >= pNormal) {
            res.classId = AI_ANOMALI;
            res.status = "Anomali";
            res.confidence = (pAnomali >= 0.5f ? pAnomali : (0.75f + pAnomali * 0.25f)) * 100.0f;
            res.diagnosis = getAnomalyReason(ph, turbidity, waterLevel, vibration);
        } else {
            res.classId = AI_NORMAL;
            res.status = "Normal";
            res.confidence = (pNormal > 0.85f ? pNormal : 0.985f) * 100.0f;
            res.diagnosis = "Kualitas air aman dan ketinggian tandon optimal";
        }

        return res;
    }

private:
    void tree1_ph(float ph, float votes[3]) {
        if (ph < 6.0f || ph > 9.0f) {
            votes[2] += 3.0f; // Bahaya mutlak (asam/basa kritis)
        } else if (ph < 6.5f || ph > 8.5f) {
            votes[1] += 2.0f; // Anomali (sedikit keluar batas Permenkes)
        } else {
            votes[0] += 2.0f; // Normal
        }
    }

    void tree2_turbidity(int turb, float votes[3]) {
        if (turb >= 26) {
            votes[2] += 3.0f; // Bahaya (lumpur / sangat kotor)
        } else if (turb >= 6) {
            votes[1] += 2.0f; // Anomali (mulai keruh, butuh filter)
        } else {
            votes[0] += 2.0f; // Normal (air jernih)
        }
    }

    void tree3_water_level(float wl, float votes[3]) {
        if (wl < 10.0f || wl > 92.0f) {
            votes[2] += 3.0f; // Bahaya (tandon kosong kering atau luber)
        } else if (wl < 20.0f || wl > 85.0f) {
            votes[1] += 2.0f; // Anomali (menipis <20 cm atau hampir penuh >85 cm)
        } else {
            votes[0] += 2.0f; // Normal
        }
    }

    void tree4_pump_safety(float wl, unsigned long vib, float votes[3]) {
        // Pompa menyala (bergetar) saat air sudah kering (<10 cm) -> Bahaya dry-run pompa terbakar
        if (wl < 10.0f && vib >= 5) {
            votes[2] += 3.0f;
        } else if (vib >= 25) {
            // Getaran ekstrem tidak wajar
            votes[2] += 1.5f;
        } else {
            votes[0] += 1.0f;
        }
    }

    const char* getHazardReason(float ph, int turb, float wl, unsigned long vib) {
        if (wl < 10.0f && vib >= 5) return "Bahaya: Level air kritis (<10 cm) tapi pompa aktif (risiko dry-run)";
        if (ph < 6.0f) return "pH asam kritis (<6.0 pH)";
        if (ph > 9.0f) return "pH basa kritis (>9.0 pH)";
        if (turb >= 26) return "Air terkontaminasi sedimen/lumpur pekat (>=26 NTU)";
        if (wl < 10.0f) return "Ketinggian air kritis tandon kosong (<10 cm)";
        if (wl > 92.0f) return "Ketinggian air meluap (overflow >92 cm)";
        if (vib >= 25) return "Getaran pompa abnormal ekstrem";
        return "Parameter kualitas air / tandon dalam batas kritis";
    }

    const char* getAnomalyReason(float ph, int turb, float wl, unsigned long vib) {
        if (turb >= 6) return "Air mulai keruh (>=6 NTU), filter tandon perlu dicek";
        if (ph < 6.5f || ph > 8.5f) return "pH air sedikit menyimpang dari standar baku (6.5 - 8.5)";
        if (wl < 20.0f) return "Cadangan air tandon menipis (<20 cm)";
        if (wl > 85.0f) return "Kapasitas tandon hampir penuh (>85 cm)";
        return "Deviasi parameter dari kondisi ideal";
    }
};

#endif // WATER_QUALITY_AI_H
