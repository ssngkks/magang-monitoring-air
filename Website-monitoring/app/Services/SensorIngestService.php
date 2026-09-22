<?php

namespace App\Services;

use App\Jobs\KirimNotifikasiAlert;
use App\Jobs\KirimNotifikasiRecovery;
use App\Models\Node;
use App\Repositories\AlertRepository;
use App\Repositories\NodeAlertStateRepository;
use App\Repositories\NodeLiveRepository;
use App\Repositories\NodeRepository;
use App\Repositories\NodeThresholdRepository;
use App\Repositories\SensorDataRepository;
use Illuminate\Support\Facades\Log;

class SensorIngestService
{
    public function __construct(
        protected SensorDataRepository $sensorRepo,
        protected NodeRepository $nodeRepo,
        protected AlertRepository $alertRepo,
        protected NodeLiveRepository $nodeLiveRepo,
        protected NodeAlertStateRepository $alertStateRepo,
        protected NodeThresholdRepository $thresholdRepo,
    ) {}

    /**
     * Ingest sensor data: simpan ke Firestore, update last_seen & nodes_live,
     * evaluasi ambang batas sensor, perbarui state alert, dan kirim notifikasi jika diperlukan.
     *
     * @param  array  $node  Data node dari VerifyNodeToken
     * @param  array  $data  Data sensor terverifikasi
     * @return array [array $sensorData, ?array $alertData]
     */
    public function ingest(array $node, array $data): array
    {
        $nodeId = (string) ($node['id'] ?? '');
        $userId = (string) ($node['user_id'] ?? '');

        $vibrationRms = (float) ($data['vibration_rms'] ?? 0);
        $thresholdVib = (float) config('watermonitoring.vibration_rms_threshold', 0.30);
        $vibration = $vibrationRms >= $thresholdVib || (! empty($data['vibration']) && $data['vibration'] === true);

        $aiStatus = $data['ai_status'] ?? 'Normal';

        // 1. Simpan pembacaan sensor ke Firestore
        $readingPayload = [
            'node_id' => $nodeId,
            'user_id' => $userId,
            'ph' => isset($data['ph']) ? (float) $data['ph'] : null,
            'temp' => isset($data['temp']) ? (float) $data['temp'] : (isset($data['suhu']) ? (float) $data['suhu'] : null),
            'humidity' => isset($data['humidity']) ? (float) $data['humidity'] : (isset($data['kelembapan']) ? (float) $data['kelembapan'] : null),
            'turbidity' => isset($data['turbidity']) ? (float) $data['turbidity'] : null,
            'water_level' => isset($data['water_level']) ? (float) $data['water_level'] : (isset($data['ketinggian_air']) ? (float) $data['ketinggian_air'] : null),
            'vibration' => $vibration,
            'vibration_rms' => $vibrationRms,
            'ai_status' => $aiStatus,
            'rssi' => $data['rssi'] ?? null,
            'snr' => $data['snr'] ?? null,
            'mpu_x' => isset($data['mpu_x']) ? (float) $data['mpu_x'] : (isset($data['acc_x']) ? (float) $data['acc_x'] : null),
            'mpu_y' => isset($data['mpu_y']) ? (float) $data['mpu_y'] : (isset($data['acc_y']) ? (float) $data['acc_y'] : null),
            'mpu_z' => isset($data['mpu_z']) ? (float) $data['mpu_z'] : (isset($data['acc_z']) ? (float) $data['acc_z'] : null),
            'roll' => isset($data['roll']) ? (float) $data['roll'] : null,
            'pitch' => isset($data['pitch']) ? (float) $data['pitch'] : null,
            'yaw' => isset($data['yaw']) ? (float) $data['yaw'] : null,
            'stability_status' => $data['stability_status'] ?? ($data['stab'] ?? 'Stabil'),
            'metadata' => $data['metadata'] ?? null,
        ];

        $readingId = $this->sensorRepo->createReading($readingPayload);
        $readingPayload['id'] = $readingId;

        // 2. Update status node & mirror live data
        $this->nodeRepo->updateLastSeen($nodeId);
        $this->nodeLiveRepo->updateLiveData($nodeId, array_merge($readingPayload, [
            'kode_node' => $node['kode_node'] ?? 'ESP32-WATER-01',
            'nama_lokasi' => $node['nama_lokasi'] ?? 'Titik Pantau Sensor Utama',
        ]), $userId);

        // 2b. Auto-detect & perbarui status Gateway ESP32 jika gateway_id dikirimkan
        $gatewayId = $data['gateway_id'] ?? null;
        if ($gatewayId) {
            $gw = Node::where('kode_node', $gatewayId)->first();
            if ($gw) {
                $gw->update([
                    'last_seen_at' => now(),
                    'status' => 'active',
                    'model_type' => 'ESP32 Gateway (LoRa)',
                ]);
            } else {
                Node::create([
                    'kode_node' => $gatewayId,
                    'device_name' => 'ESP32 LoRa Gateway',
                    'nama_lokasi' => $node['nama_lokasi'] ?? 'Stasiun Gateway Utama',
                    'model_type' => 'ESP32 Gateway (LoRa)',
                    'status' => 'active',
                    'firmware_version' => '1.0.2',
                    'last_seen_at' => now(),
                ]);
            }
        }

        // 3. Evaluasi Ambang Batas Sensor & State Machine Alert
        $thresholds = $this->thresholdRepo->getByNodeId($nodeId);
        $anomalies = [];

        // Evaluasi pH
        $ph = $readingPayload['ph'];
        if ($ph !== null) {
            $minPh = (float) ($thresholds['ph_min'] ?? 6.5);
            $maxPh = (float) ($thresholds['ph_max'] ?? 8.5);
            if ($ph < $minPh) {
                $anomalies[] = [
                    'param' => 'ph',
                    'severity' => ($ph < 5.0 || $ph < 0) ? 'critical' : 'warning',
                    'pesan' => "pH air abnormal ({$ph}), di bawah batas aman minimum ({$minPh}).",
                ];
            } elseif ($ph > $maxPh) {
                $anomalies[] = [
                    'param' => 'ph',
                    'severity' => ($ph > 9.5) ? 'critical' : 'warning',
                    'pesan' => "pH air abnormal ({$ph}), melebihi batas aman maksimum ({$maxPh}).",
                ];
            }
        }

        // Evaluasi Kekeruhan (Turbidity)
        $turbidity = $readingPayload['turbidity'];
        if ($turbidity !== null) {
            $maxTurb = (float) ($thresholds['turbidity_max'] ?? 1.5);
            if ($turbidity > $maxTurb) {
                $anomalies[] = [
                    'param' => 'turbidity',
                    'severity' => ($turbidity > 5.0) ? 'critical' : 'warning',
                    'pesan' => "Kekeruhan air tinggi ({$turbidity} NTU), melebihi batas normal ({$maxTurb} NTU).",
                ];
            }
        }

        // Evaluasi Suhu
        $temp = $readingPayload['temp'];
        if ($temp !== null) {
            $maxTemp = (float) ($thresholds['temperature_max'] ?? 28.0);
            if ($temp > $maxTemp) {
                $anomalies[] = [
                    'param' => 'temperature',
                    'severity' => ($temp > 40.0) ? 'critical' : 'warning',
                    'pesan' => "Suhu air/sensor tinggi ({$temp}°C), melebihi batas aman ({$maxTemp}°C).",
                ];
            }
        }

        // Evaluasi Getaran
        if ($vibration) {
            $anomalies[] = [
                'param' => 'vibration',
                'severity' => 'warning',
                'pesan' => 'Getaran mekanik terdeteksi pada sensor ESP32.',
            ];
        }

        // Evaluasi Ketinggian Air
        $wl = $readingPayload['water_level'];
        if ($wl !== null && $wl > 0) {
            $minWl = (float) ($thresholds['water_level_min'] ?? 80.0);
            $maxWl = (float) ($thresholds['water_level_max'] ?? 130.0);
            if ($wl < $minWl) {
                $anomalies[] = [
                    'param' => 'water_level',
                    'severity' => 'warning',
                    'pesan' => "Level air rendah ({$wl} cm), di bawah batas minimum ({$minWl} cm).",
                ];
            } elseif ($wl > $maxWl) {
                $anomalies[] = [
                    'param' => 'water_level',
                    'severity' => 'critical',
                    'pesan' => "Level air meluap ({$wl} cm), melebihi batas maksimum ({$maxWl} cm).",
                ];
            }
        }

        // Evaluasi Status AI jika ada
        if (in_array($aiStatus, ['Bahaya', 'Anomali'], true)) {
            $anomalies[] = [
                'param' => 'ai_status',
                'severity' => $aiStatus === 'Bahaya' ? 'critical' : 'warning',
                'pesan' => "Analisis AI mendeteksi status: {$aiStatus} pada data sensor.",
            ];
        }

        $alert = null;
        $currentState = $this->alertStateRepo->getState($nodeId);
        $previousSeverity = $currentState['current_severity'] ?? 'normal';

        if (! empty($anomalies)) {
            // Tentukan keparahan tertinggi
            $hasCritical = false;
            $messages = [];
            foreach ($anomalies as $ano) {
                if ($ano['severity'] === 'critical') {
                    $hasCritical = true;
                }
                $messages[] = $ano['pesan'];
            }

            $severity = $hasCritical ? 'critical' : 'warning';
            $mainMessage = implode(' | ', array_slice($messages, 0, 2));

            $alertData = [
                'node_id' => $nodeId,
                'user_id' => $userId,
                'pesan' => $mainMessage,
                'severity' => $severity,
                'status' => 'active',
                'is_read' => false,
            ];

            $alertId = $this->alertRepo->createAlert($alertData);
            $alertData['id'] = $alertId;
            $alertData['reading'] = $readingPayload;
            $alert = $alertData;

            // Update State Machine
            $this->alertStateRepo->updateState($nodeId, $severity, $anomalies[0]['param']);

            // Cek Cooldown notifikasi (10 menit) — hindari spam, kecuali level naik dari warning ke critical
            $cooldownMinutes = (int) config('watermonitoring.alert_cooldown_minutes', 10);
            $inCooldown = $this->alertStateRepo->isInCooldown($nodeId, $cooldownMinutes);
            if ($previousSeverity === 'warning' && $severity === 'critical') {
                $inCooldown = false;
            }

            if (! $inCooldown) {
                $this->alertStateRepo->updateLastNotified($nodeId);
                try {
                    KirimNotifikasiAlert::dispatch($alertData, $node);
                } catch (\Throwable $e) {
                    Log::error('Gagal dispatch KirimNotifikasiAlert', [
                        'alert_id' => $alertId,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        } elseif ($previousSeverity !== 'normal') {
            // Deteksi pemulihan (Recovery)
            $this->alertStateRepo->updateState($nodeId, 'normal');

            try {
                KirimNotifikasiRecovery::dispatch($node, ucfirst($previousSeverity));
            } catch (\Throwable $e) {
                Log::error('Gagal dispatch KirimNotifikasiRecovery', [
                    'node_id' => $nodeId,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return [$readingPayload, $alert];
    }
}
