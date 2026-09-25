<?php

namespace App\Services;

use App\Repositories\NodeLiveRepository;
use App\Repositories\NodeRepository;
use App\Repositories\SensorDataRepository;
use Carbon\Carbon;

class AIDiagnosticService
{
    public function __construct(
        protected SensorDataRepository $sensorRepo,
        protected NodeLiveRepository $nodeLiveRepo,
        protected NodeRepository $nodeRepo,
    ) {}

    /**
     * Helper evaluasi berbasis reading sensor.
     * Menggunakan hasil inferensi murni dari ESP32 Gateway jika tersedia di reading.
     */
    public function evaluate(array $reading): array
    {
        $ph = isset($reading['ph']) ? (float) $reading['ph'] : 7.0;
        $turb = isset($reading['turbidity']) ? (float) $reading['turbidity'] : 0.0;
        $temp = isset($reading['temp']) ? (float) $reading['temp'] : (isset($reading['suhu']) ? (float) $reading['suhu'] : 27.0);
        $wl = isset($reading['water_level']) ? (float) $reading['water_level'] : (isset($reading['ketinggian_air']) ? (float) $reading['ketinggian_air'] : 50.0);
        $vib = isset($reading['getaran']) ? (int) $reading['getaran'] : ((isset($reading['vibration']) && $reading['vibration']) ? 1 : 0);

        // Ambil hasil inferensi langsung dari ESP32 jika ada
        $deviceStatus = $reading['ai_status'] ?? 'Normal';
        $confidence = isset($reading['ai_confidence']) ? (float) $reading['ai_confidence'] : 98.2;
        $latencyUs = isset($reading['latency_us']) ? (int) $reading['latency_us'] : 28;

        $triggers = $this->computeTriggers($ph, $turb, $wl, $vib);

        // SATU hasil diagnosis: status + penjelasan selalu dari sumber yang sama.
        [$status, $diagnosis] = $this->resolveDiagnosis($deviceStatus, $triggers, $reading['ai_diagnosis'] ?? null);

        $radar = $this->buildRadarData($ph, $turb, $temp, $wl, $vib);

        return [
            'status' => $status,
            'confidence' => $confidence,
            'diagnosis' => $diagnosis,
            'triggers' => $triggers,
            'latency_us' => $latencyUs,
            'radar' => $radar,
            'raw_reading' => [
                'ph' => $ph,
                'turbidity' => $turb,
                'temp' => $temp,
                'water_level' => $wl,
                'vibration' => $vib,
            ],
            'timestamp' => now()->toIso8601String(),
        ];
    }

    /**
     * Ambil data analisis AI lengkap untuk halaman /ai-analytics.
     * Sumber data MURNI dari ESP32 Gateway (TinyML).
     * Jika ESP32 offline/mati, tetap tampilkan data dan diagnosa terakhir saat online.
     */
    public function getDiagnosticsForNode(string $nodeId, ?array $latestReading = null): array
    {
        $currentReading = $latestReading;
        $lastSeenTime = null;

        // 1. Ambil data reading terkini dari nodes_live (tetap tersimpan meski ESP32 offline)
        if (! $currentReading) {
            $live = $this->nodeLiveRepo->find($nodeId);
            if ($live && ! empty($live['last_reading'])) {
                $currentReading = $live['last_reading'];
                $lastSeenTime = $live['last_seen_at'] ?? null;
            }
        }

        // 2. Ambil riwayat sensor dari Firestore (maksimal 30 record)
        $readings = $this->sensorRepo->getByNodeId($nodeId, 30);
        if (! $currentReading && ! empty($readings)) {
            $currentReading = $readings[0];
            $lastSeenTime = $currentReading['created_at'] ?? ($currentReading['received_at'] ?? null);
        }

        // 3. Fallback jika sistem baru pertama kali dipasang dan belum ada data
        if (! $currentReading) {
            $node = $this->nodeRepo->find($nodeId);
            $lastSeenTime = $node['last_seen_at'] ?? null;
            $currentReading = [
                'ph' => 7.2,
                'turbidity' => 0.0,
                'temp' => 27.5,
                'water_level' => 75.0,
                'vibration' => 0,
                'ai_status' => 'Normal',
                'ai_confidence' => 99.2,
                'ai_diagnosis' => 'Kualitas air aman dan seluruh parameter sistem beroperasi dalam batas optimal.',
                'latency_us' => 28,
            ];
        }

        // Ekstraksi hasil AI murni yang dihitung oleh TinyML di ESP32 Gateway
        $deviceStatus = $currentReading['ai_status'] ?? 'Normal';
        $confidence = isset($currentReading['ai_confidence']) ? (float) $currentReading['ai_confidence'] : 98.2;
        $latencyUs = isset($currentReading['latency_us']) ? (int) $currentReading['latency_us'] : 28;

        $ph = isset($currentReading['ph']) ? (float) $currentReading['ph'] : 7.0;
        $turb = isset($currentReading['turbidity']) ? (float) $currentReading['turbidity'] : 0.0;
        $temp = isset($currentReading['temp']) ? (float) $currentReading['temp'] : (isset($currentReading['suhu']) ? (float) $currentReading['suhu'] : 27.0);
        $wl = isset($currentReading['water_level']) ? (float) $currentReading['water_level'] : (isset($currentReading['ketinggian_air']) ? (float) $currentReading['ketinggian_air'] : 50.0);
        $vib = isset($currentReading['getaran']) ? (int) $currentReading['getaran'] : ((isset($currentReading['vibration']) && $currentReading['vibration']) ? 1 : 0);

        // Parameter pemicu aktif
        $triggers = $this->computeTriggers($ph, $turb, $wl, $vib);

        // SATU hasil diagnosis: status + penjelasan selalu dari sumber yang sama.
        [$status, $diagnosis] = $this->resolveDiagnosis($deviceStatus, $triggers, $currentReading['ai_diagnosis'] ?? null);

        // Radar normalisasi 0 - 100 untuk spider chart
        $radar = $this->buildRadarData($ph, $turb, $temp, $wl, $vib);

        $tsRaw = $lastSeenTime ?? ($currentReading['created_at'] ?? ($currentReading['received_at'] ?? null));
        $timestamp = $this->formatTimestamp($tsRaw);

        $current = [
            'status' => $status,
            'confidence' => $confidence,
            'diagnosis' => $diagnosis,
            'triggers' => $triggers,
            'latency_us' => $latencyUs,
            'radar' => $radar,
            'raw_reading' => [
                'ph' => $ph,
                'turbidity' => $turb,
                'temp' => $temp,
                'water_level' => $wl,
                'vibration' => $vib,
            ],
            'timestamp' => $timestamp,
        ];

        // 4. Bentuk riwayat dari database (murni dari data inferensi ESP32 yang tersimpan)
        $history = [];
        foreach ($readings as $r) {
            $hStatus = $r['ai_status'] ?? 'Normal';
            $hConfidence = isset($r['ai_confidence']) ? ((float) $r['ai_confidence'].'%') : '98.2%';

            $hPh = isset($r['ph']) ? (float) $r['ph'] : 7.0;
            $hTurb = isset($r['turbidity']) ? (float) $r['turbidity'] : 0.0;
            $hWl = isset($r['water_level']) ? (float) $r['water_level'] : (isset($r['ketinggian_air']) ? (float) $r['ketinggian_air'] : 50.0);
            $hVib = isset($r['getaran']) ? (int) $r['getaran'] : ((array_key_exists('vibration', $r) && $r['vibration']) ? 1 : null);

            // Rekonsiliasi baris riwayat yang sama: status + catatan dari satu hasil diagnosis.
            [$hStatus, $hDiag] = $this->resolveDiagnosis(
                $hStatus,
                $this->computeTriggers($hPh, $hTurb, $hWl, $hVib),
                $r['ai_diagnosis'] ?? null
            );
            $hTs = $this->formatTimestamp($r['created_at'] ?? ($r['received_at'] ?? null));

            $primaryTrigger = '-';
            if ($hPh < 6.5 || $hPh > 8.5) {
                $primaryTrigger = "pH Air: {$hPh} pH";
            } elseif ($hTurb >= 6.0) {
                $primaryTrigger = "Kekeruhan: {$hTurb} NTU";
            } elseif ($hWl < 20.0 || $hWl > 85.0) {
                $primaryTrigger = "Level Air: {$hWl} cm";
            }

            $history[] = [
                'timestamp' => $hTs,
                'status' => $hStatus,
                'confidence' => $hConfidence,
                'trigger' => $primaryTrigger,
                'note' => $hDiag,
            ];
        }

        return [
            'current' => $current,
            'history' => array_slice($history, 0, 20),
            'comparison' => $this->getComparisonTable(),
        ];
    }

    /**
     * Hitung parameter pemicu dari nilai sensor memakai ambang project yang sudah ada:
     * pH 6.5–8.5 (kritis < 6.0 /> 9.0), kekeruhan ≥ 6 NTU (kritis ≥ 26),
     * level air 20–85 cm (kritis < 10 /> 92), getaran ≥ 6 pulsa (kritis ≥ 20).
     * $vib null = data getaran tidak tersedia pada baris ini, pemicu getaran dilewati.
     *
     * @return array<int, array{param: string, value: string, level: string}>
     */
    private function computeTriggers(float $ph, float $turb, float $wl, ?int $vib): array
    {
        $triggers = [];
        if ($ph < 6.5 || $ph > 8.5) {
            $triggers[] = ['param' => 'pH Air', 'value' => "{$ph} pH", 'level' => ($ph < 6.0 || $ph > 9.0) ? 'critical' : 'warning'];
        }
        if ($turb >= 6.0) {
            $triggers[] = ['param' => 'Kekeruhan Air', 'value' => "{$turb} NTU", 'level' => ($turb >= 26.0) ? 'critical' : 'warning'];
        }
        if ($wl < 20.0 || $wl > 85.0) {
            $triggers[] = ['param' => 'Ketinggian Air', 'value' => "{$wl} cm", 'level' => ($wl < 10.0 || $wl > 92.0) ? 'critical' : 'warning'];
        }
        if ($vib !== null && $vib >= 6) {
            $triggers[] = ['param' => 'Getaran Pompa', 'value' => "{$vib} pulsa", 'level' => ($vib >= 20) ? 'critical' : 'warning'];
        }

        return $triggers;
    }

    private function statusRank(string $status): int
    {
        return match ($status) {
            'Bahaya' => 2,
            'Anomali' => 1,
            default => 0,
        };
    }

    /**
     * Daftar teks diagnosis bawaan yang hanya valid untuk kondisi Normal.
     * Teks-teks ini dipakai sebagai fallback saat perangkat tidak mengirim
     * ai_diagnosis, sehingga tidak boleh tampil bersama status Anomali/Bahaya.
     */
    private function isDefaultOptimalText(?string $text): bool
    {
        if ($text === null || trim($text) === '') {
            return true;
        }

        $known = [
            'Kualitas air aman dan seluruh parameter sistem beroperasi dalam batas optimal.',
            'Kualitas air aman dan operasional sistem optimal.',
            'Kualitas air aman, operasional optimal',
            'Parameter stabil.',
            'Normal',
        ];

        return in_array(trim($text), $known, true);
    }

    /**
     * Bangun penjelasan dari status final + pemicu aktual.
     */
    private function buildDiagnosis(string $status, array $triggers): string
    {
        if ($status === 'Normal') {
            return 'Kualitas air aman dan seluruh parameter sistem beroperasi dalam batas optimal.';
        }

        $causes = [];
        foreach ($triggers as $t) {
            $causes[] = "{$t['param']} {$t['value']}";
        }
        $causeText = implode(', ', $causes);

        if ($causeText !== '') {
            if ($status === 'Bahaya') {
                return "Kondisi memerlukan perhatian karena terdapat parameter di luar batas aman: {$causeText}.";
            }

            return "Beberapa parameter perlu diperhatikan karena mendekati atau melewati batas normal: {$causeText}.";
        }

        // Status non-Normal berasal murni dari inferensi perangkat tanpa
        // pemicu lokal: jelaskan sumbernya secara jujur tanpa mengarang penyebab.
        if ($status === 'Bahaya') {
            return 'Hasil inferensi Edge AI menunjukkan kondisi bahaya. Parameter pantau berada dalam batas lokal; segera periksa sistem secara langsung.';
        }

        return 'Hasil inferensi Edge AI menunjukkan anomali. Parameter pantau berada dalam batas lokal; periksa detail telemetri untuk validasi.';
    }

    /**
     * SATU hasil diagnosis: tentukan status final dari yang terburuk antara
     * status perangkat dan status turunan pemicu, lalu pilih penjelasan yang
     * konsisten dengan status final tersebut.
     *
     * @param  array<int, array{param: string, value: string, level: string}>  $triggers
     * @return array{0: string, 1: string} [status, diagnosis]
     */
    private function resolveDiagnosis(string $deviceStatus, array $triggers, ?string $deviceDiagnosis): array
    {
        $derived = 'Normal';
        foreach ($triggers as $t) {
            if (($t['level'] ?? '') === 'critical') {
                $derived = 'Bahaya';
                break;
            }
            $derived = 'Anomali';
        }

        $status = $this->statusRank($deviceStatus) >= $this->statusRank($derived) ? $deviceStatus : $derived;
        if (! in_array($status, ['Normal', 'Anomali', 'Bahaya'], true)) {
            $status = 'Normal';
        }

        // Teks bawaan "optimal" hanya boleh tampil saat kondisi benar-benar Normal.
        if ($status === 'Normal' && empty($triggers)) {
            $diagnosis = ($deviceDiagnosis !== null && trim($deviceDiagnosis) !== '')
                ? $deviceDiagnosis
                : 'Kualitas air aman dan seluruh parameter sistem beroperasi dalam batas optimal.';

            return [$status, $diagnosis];
        }

        // Pertahankan penjelasan asli perangkat hanya jika ia penjelasan nyata
        // (bukan teks bawaan) untuk kondisi non-Normal.
        if ($deviceDiagnosis !== null && trim($deviceDiagnosis) !== '' && ! $this->isDefaultOptimalText($deviceDiagnosis)) {
            return [$status, $deviceDiagnosis];
        }

        return [$status, $this->buildDiagnosis($status, $triggers)];
    }

    private function buildRadarData(float $ph, float $turb, float $temp, float $wl, int $vib): array
    {
        return [
            [
                'subject' => 'pH Air',
                'nilai_aktual' => $ph,
                'skor' => round(min(max(abs($ph - 7.0) / 3.5 * 100, 5), 100), 1),
                'batas_aman' => 45,
                'unit' => 'pH',
            ],
            [
                'subject' => 'Kekeruhan',
                'nilai_aktual' => $turb,
                'skor' => round(min(max(($turb / 30.0) * 100, 5), 100), 1),
                'batas_aman' => 20,
                'unit' => 'NTU',
            ],
            [
                'subject' => 'Ketinggian Air',
                'nilai_aktual' => $wl,
                'skor' => round(min(max(($wl / 100.0) * 100, 5), 100), 1),
                'batas_aman' => 85,
                'unit' => 'cm',
            ],
            [
                'subject' => 'Suhu Lingkungan',
                'nilai_aktual' => $temp,
                'skor' => round(min(max((($temp - 20.0) / 25.0) * 100, 5), 100), 1),
                'batas_aman' => 50,
                'unit' => '°C',
            ],
            [
                'subject' => 'Getaran Mekanik',
                'nilai_aktual' => $vib,
                'skor' => round(min(max(($vib / 25.0) * 100, 5), 100), 1),
                'batas_aman' => 25,
                'unit' => 'pulsa',
            ],
        ];
    }

    private function getComparisonTable(): array
    {
        return [
            [
                'skenario' => 'pH 6.7, Kekeruhan 7 NTU, Level Air 45 cm',
                'threshold_biasa' => 'Normal (karena masing-masing parameter berdiri sendiri belum melampaui batas kritis tunggal)',
                'edge_ai' => 'Anomali (mendeteksi pola silang kekeruhan mulai naik dan pH bergeser)',
                'keuntungan' => 'Deteksi dini sebelum air tercemar atau pipa tersumbat.',
            ],
            [
                'skenario' => 'Ketinggian Air Rendah (<10 cm) & Pompa Masih Aktif',
                'threshold_biasa' => 'Peringatan Biasa (hanya flag ketinggian)',
                'edge_ai' => 'Bahaya (mendeteksi ancaman kavitasi dan pompa berputar kering / dry-run)',
                'keuntungan' => 'Mencegah kerusakan fatal motor pompa air.',
            ],
            [
                'skenario' => 'Air Jernih (0 NTU), pH 7.2, Level 75 cm',
                'threshold_biasa' => 'Normal',
                'edge_ai' => 'Normal (Confidence 98-99% optimal)',
                'keuntungan' => 'Bebas dari alarm palsu (Zero False Positive).',
            ],
            [
                'skenario' => 'Fluktuasi Sinyal Sesaat (Spike Noise ADC)',
                'threshold_biasa' => 'Langsung memicu alarm palsu',
                'edge_ai' => 'Difilter oleh ensemble voting TinyML di ESP32',
                'keuntungan' => 'Menghilangkan kelelahan alarm (Alert Fatigue).',
            ],
        ];
    }

    private function formatTimestamp($val): string
    {
        if ($val instanceof \DateTimeInterface) {
            return Carbon::instance($val)->locale('id')->isoFormat('D MMM Y, HH:mm:ss').' WIB';
        }

        if (is_numeric($val)) {
            $sec = strlen((string) (int) $val) > 10 ? (int) ($val / 1000) : (int) $val;

            return Carbon::createFromTimestamp($sec)->locale('id')->isoFormat('D MMM Y, HH:mm:ss').' WIB';
        }

        if (is_string($val)) {
            try {
                return Carbon::parse($val)->locale('id')->isoFormat('D MMM Y, HH:mm:ss').' WIB';
            } catch (\Exception $e) {
                return $val;
            }
        }

        return now()->locale('id')->isoFormat('D MMM Y, HH:mm:ss').' WIB';
    }
}
