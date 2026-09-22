<?php

namespace App\Services;

use App\Repositories\AlertRepository;
use App\Repositories\NodeLiveRepository;
use App\Repositories\NodeRepository;
use App\Repositories\NodeThresholdRepository;
use App\Repositories\SensorDataRepository;
use Google\Cloud\Core\Timestamp;
use Google\Cloud\Firestore\FirestoreClient;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Kreait\Firebase\Factory;

class FirebaseSyncService
{
    protected static ?int $lastSyncTimestamp = null;

    protected static ?string $lastReadingSignature = null;

    public function __construct(
        protected NodeRepository $nodeRepo,
        protected NodeLiveRepository $nodeLiveRepo,
        protected SensorDataRepository $sensorRepo,
        protected AlertRepository $alertRepo,
        protected NodeThresholdRepository $thresholdRepo,
    ) {}

    /**
     * Decode the creation timestamp from a Firebase Push ID.
     */
    public static function decodePushIdTime(string $id): ?\DateTime
    {
        if (strlen($id) < 8) {
            return null;
        }

        $chars = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
        $time = 0;
        for ($i = 0; $i < 8; $i++) {
            $c = $id[$i];
            $pos = strpos($chars, $c);
            if ($pos === false) {
                return null;
            }
            $time = $time * 64 + $pos;
        }

        $seconds = (int) ($time / 1000);
        $dt = new \DateTime("@$seconds");
        $dt->setTimezone(new \DateTimeZone('UTC'));

        return $dt;
    }

    /**
     * Sync data from Firebase Realtime Database into Cloud Firestore.
     * Untuk web request: cepat (hanya membaca /sensor/latest & update live data).
     * Untuk CLI ($syncHistory = true): menyinkronkan seluruh riwayat /sensor/history.
     */
    public function syncFromRealtimeDatabase(?string $nodeId = null, ?string $userId = null, bool $syncHistory = false, int $historyLimit = 50, bool $force = false): array
    {
        $now = time();
        $cacheKey = 'fb_sync_cooldown_'.($nodeId ?? 'global');

        // Cooldown 5 detik antar sinkronisasi kecuali $force menggunakan shared Cache
        if (! $force && Cache::has($cacheKey)) {
            return ['status' => 'skipped', 'message' => 'Throttled (cache active)'];
        }
        Cache::put($cacheKey, $now, 5);

        $dbUrl = config('firebase.database_url');
        $credPath = config('firebase.credentials');

        if (! $dbUrl || ! $credPath) {
            return ['status' => 'error', 'message' => 'Firebase credentials or database URL not configured'];
        }

        $resolvedCred = file_exists($credPath) ? $credPath : base_path($credPath);
        if (! file_exists($resolvedCred)) {
            Log::warning("FirebaseSyncService: Credentials file not found at $resolvedCred");

            return ['status' => 'error', 'message' => 'Credentials file not found'];
        }

        try {
            $factory = (new Factory)
                ->withServiceAccount($resolvedCred)
                ->withDatabaseUri($dbUrl);

            $rtdb = $factory->createDatabase();

            $firestore = app('firebase.firestore');
            $fsDb = $firestore instanceof FirestoreClient ? $firestore : $firestore->database();

            // 1. Fetch latest reading & hardware timestamp dari RTDB
            $latest = $rtdb->getReference('/sensor/latest')->getValue();
            if (! is_array($latest)) {
                $latest = $rtdb->getReference('/latest')->getValue();
            }

            // Dapatkan waktu riil hardware ESP32 dari push key terakhir di /sensor/history
            $sensorDt = null;
            try {
                $lastHistory = $rtdb->getReference('/sensor/history')->orderByKey()->limitToLast(1)->getValue();
                if (is_array($lastHistory) && ! empty($lastHistory)) {
                    $lastKey = array_key_first($lastHistory);
                    $sensorDt = self::decodePushIdTime($lastKey);
                }
            } catch (\Throwable $ignored) {
            }

            if (! $sensorDt) {
                $sensorDt = new \DateTime;
            }

            $sensorTs = new Timestamp($sensorDt);
            // Node dinyatakan online jika waktu data sensor diterima dalam 5 menit (300 detik) terakhir
            $isOnline = (time() - $sensorDt->getTimestamp()) <= 300;

            // 2. Resolve Node & User ID
            $rtdbKodeNode = is_array($latest) ? ($latest['kode_node'] ?? 'ESP32-WATER-01') : 'ESP32-WATER-01';

            if (! $nodeId) {
                $nodes = $userId ? $this->nodeRepo->getByUserId($userId) : $this->nodeRepo->getAll();
                if (empty($nodes)) {
                    return ['status' => 'no_nodes'];
                }

                // Cari node yang cocok dengan kode_node transmisi
                $matchedNode = null;
                foreach ($nodes as $n) {
                    if (($n['kode_node'] ?? '') === $rtdbKodeNode) {
                        $matchedNode = $n;
                        break;
                    }
                }

                // Jika tidak ada kode_node yang sama persis, gunakan node terdaftar pertama milik user
                $node = $matchedNode ?: $nodes[0];
                $nodeId = $node['id'];
                $userId = $node['user_id'] ?? $userId;
            } else {
                $node = $this->nodeRepo->find($nodeId);
                $userId = $node['user_id'] ?? $userId;
            }

            if (! $nodeId || ! $node) {
                return ['status' => 'no_node_id'];
            }

            $syncedCount = 0;

            if (is_array($latest)) {
                $vibrationRms = (float) ($latest['getaran'] ?? $latest['vibration_rms'] ?? 0);
                $vibration = $vibrationRms >= 0.3 || ((int) ($latest['getaran'] ?? 0)) > 0;

                $readingPayload = [
                    'ph' => isset($latest['ph']) ? (float) $latest['ph'] : null,
                    'temp' => isset($latest['suhu']) ? (float) $latest['suhu'] : (isset($latest['temp']) ? (float) $latest['temp'] : null),
                    'humidity' => isset($latest['kelembapan']) ? (float) $latest['kelembapan'] : (isset($latest['humidity']) ? (float) $latest['humidity'] : null),
                    'turbidity' => isset($latest['turbidity']) ? (float) $latest['turbidity'] : null,
                    'water_level' => isset($latest['ketinggian_air']) ? (float) $latest['ketinggian_air'] : (isset($latest['water_level']) ? (float) $latest['water_level'] : null),
                    'vibration' => $vibration,
                    'vibration_rms' => $vibrationRms,
                    'ai_status' => $latest['ai_status'] ?? 'Normal',
                    'ai_confidence' => isset($latest['ai_confidence']) ? (float) $latest['ai_confidence'] : 98.0,
                    'ai_diagnosis' => $latest['ai_diagnosis'] ?? 'Kualitas air aman, operasional optimal',
                    'latency_us' => isset($latest['inference_us']) ? (int) $latest['inference_us'] : (isset($latest['latency_us']) ? (int) $latest['latency_us'] : 28),
                    'rssi' => $latest['rssi'] ?? -43,
                    'snr' => $latest['snr'] ?? 10.0,
                    'mpu_x' => isset($latest['mpu_x']) ? (float) $latest['mpu_x'] : (isset($latest['acc_x']) ? (float) $latest['acc_x'] : null),
                    'mpu_y' => isset($latest['mpu_y']) ? (float) $latest['mpu_y'] : (isset($latest['acc_y']) ? (float) $latest['acc_y'] : null),
                    'mpu_z' => isset($latest['mpu_z']) ? (float) $latest['mpu_z'] : (isset($latest['acc_z']) ? (float) $latest['acc_z'] : null),
                    'roll' => isset($latest['roll']) ? (float) $latest['roll'] : null,
                    'pitch' => isset($latest['pitch']) ? (float) $latest['pitch'] : null,
                    'yaw' => isset($latest['yaw']) ? (float) $latest['yaw'] : null,
                    'stability_status' => $latest['stability_status'] ?? ($latest['stab'] ?? 'Stabil'),
                    'node_id' => $nodeId,
                    'user_id' => $userId,
                    'kode_node' => $node['kode_node'] ?? 'ESP32-WATER-01',
                    'nama_lokasi' => $node['nama_lokasi'] ?? 'Titik Pantau Sensor Utama',
                    'created_at' => $sensorTs,
                    'received_at' => $sensorTs,
                ];

                // Cek signature data + timestamp hardware
                $currentSig = md5(json_encode([
                    $readingPayload['ph'],
                    $readingPayload['temp'],
                    $readingPayload['humidity'],
                    $readingPayload['turbidity'],
                    $readingPayload['water_level'],
                    $sensorDt->getTimestamp(),
                ]));

                // Update live node status di Firestore dengan timestamp hardware riil
                $fsDb->collection('nodes_live')->document($nodeId)->set([
                    'node_id' => $nodeId,
                    'user_id' => $userId,
                    'kode_node' => $node['kode_node'] ?? 'ESP32-WATER-01',
                    'nama_lokasi' => $node['nama_lokasi'] ?? 'Titik Pantau Sensor Utama',
                    'last_seen_at' => $sensorTs,
                    'is_online' => $isOnline,
                    'last_reading' => $readingPayload,
                    'updated_at' => $sensorTs,
                ], ['merge' => true]);

                $fsDb->collection('nodes')->document($nodeId)->set([
                    'last_seen_at' => $sensorTs,
                    'updated_at' => $sensorTs,
                ], ['merge' => true]);

                // Simpan record baru ke sensor_readings jika ada data hardware baru
                if ($currentSig !== self::$lastReadingSignature) {
                    self::$lastReadingSignature = $currentSig;
                    $fsDb->collection('sensor_readings')->newDocument()->set($readingPayload);
                    $syncedCount++;

                    // Simpan juga ke RTDB per-node path agar data multi-device tidak saling menimpa
                    $nodeKode = $node['kode_node'] ?? 'ESP32-WATER-01';
                    try {
                        $rtdb->getReference('/sensor/nodes/'.$nodeKode.'/latest')->set($latest);
                    } catch (\Throwable $e) {
                    }
                }

                // 3. Evaluasi Alert jika abnormal
                $ph = $readingPayload['ph'];
                $temp = $readingPayload['temp'];
                $turb = $readingPayload['turbidity'];
                $anomalies = [];

                if ($ph !== null && ($ph < 6.5 || $ph > 8.5)) {
                    $anomalies[] = "Nilai pH air abnormal ({$ph})";
                }
                if ($temp !== null && $temp > 28.0) {
                    $anomalies[] = "Suhu sensor tinggi ({$temp}°C)";
                }
                if ($turb !== null && $turb > 1.5) {
                    $anomalies[] = "Kekeruhan air tinggi ({$turb} NTU)";
                }

                if (! empty($anomalies)) {
                    $activeAlerts = $this->alertRepo->getByNodeId($nodeId, false, 1);
                    if (empty($activeAlerts)) {
                        $this->alertRepo->createAlert([
                            'node_id' => $nodeId,
                            'user_id' => $userId,
                            'pesan' => implode(' | ', $anomalies),
                            'severity' => (($ph !== null && $ph < 5.0) || ($temp !== null && $temp > 40.0) || ($turb !== null && $turb > 5.0)) ? 'critical' : 'warning',
                            'status' => 'active',
                            'is_read' => false,
                        ]);
                    }
                }
            }

            // 4. Sinkronisasi history hanya jika diminta (misal dari Artisan CLI)
            if ($syncHistory) {
                $historyRef = $rtdb->getReference('/sensor/history');
                $history = $historyRef->getSnapshot()->exists()
                    ? $historyRef->orderByKey()->limitToLast($historyLimit)->getValue()
                    : null;

                if (is_array($history) && ! empty($history)) {
                    $bulkWriter = $fsDb->bulkWriter();

                    foreach ($history as $key => $item) {
                        if (! is_array($item)) {
                            continue;
                        }

                        $dt = self::decodePushIdTime($key) ?? new \DateTime;
                        $ts = new Timestamp($dt);

                        $vibrationRms = (float) ($item['getaran'] ?? $item['vibration_rms'] ?? 0);
                        $vibration = $vibrationRms >= 0.3 || ((int) ($item['getaran'] ?? 0)) > 0;
                        $itemNodeId = (string) ($item['node_id'] ?? $item['kode_node'] ?? $nodeId);
                        $itemKodeNode = (string) ($item['kode_node'] ?? $node['kode_node'] ?? 'ESP32-WATER-01');

                        $payload = [
                            'node_id' => $itemNodeId,
                            'kode_node' => $itemKodeNode,
                            'user_id' => $userId,
                            'ph' => isset($item['ph']) ? (float) $item['ph'] : null,
                            'temp' => isset($item['suhu']) ? (float) $item['suhu'] : (isset($item['temp']) ? (float) $item['temp'] : null),
                            'humidity' => isset($item['kelembapan']) ? (float) $item['kelembapan'] : (isset($item['humidity']) ? (float) $item['humidity'] : null),
                            'turbidity' => isset($item['turbidity']) ? (float) $item['turbidity'] : null,
                            'water_level' => isset($item['ketinggian_air']) ? (float) $item['ketinggian_air'] : (isset($item['water_level']) ? (float) $item['water_level'] : null),
                            'vibration' => $vibration,
                            'vibration_rms' => $vibrationRms,
                            'ai_status' => $item['ai_status'] ?? 'Normal',
                            'ai_confidence' => isset($item['ai_confidence']) ? (float) $item['ai_confidence'] : 98.0,
                            'ai_diagnosis' => $item['ai_diagnosis'] ?? 'Kualitas air aman, operasional optimal',
                            'latency_us' => isset($item['inference_us']) ? (int) $item['inference_us'] : (isset($item['latency_us']) ? (int) $item['latency_us'] : 28),
                            'rssi' => $item['rssi'] ?? -43,
                            'snr' => $item['snr'] ?? 10.0,
                            'mpu_x' => isset($item['mpu_x']) ? (float) $item['mpu_x'] : (isset($item['acc_x']) ? (float) $item['acc_x'] : null),
                            'mpu_y' => isset($item['mpu_y']) ? (float) $item['mpu_y'] : (isset($item['acc_y']) ? (float) $item['acc_y'] : null),
                            'mpu_z' => isset($item['mpu_z']) ? (float) $item['mpu_z'] : (isset($item['acc_z']) ? (float) $item['acc_z'] : null),
                            'roll' => isset($item['roll']) ? (float) $item['roll'] : null,
                            'pitch' => isset($item['pitch']) ? (float) $item['pitch'] : null,
                            'yaw' => isset($item['yaw']) ? (float) $item['yaw'] : null,
                            'stability_status' => $item['stability_status'] ?? ($item['stab'] ?? 'Stabil'),
                            'received_at' => $ts,
                            'created_at' => $ts,
                            'rtdb_key' => $key,
                        ];

                        $docRef = $fsDb->collection('sensor_readings')->document($key);
                        $bulkWriter->set($docRef, $payload, ['merge' => true]);
                        $syncedCount++;
                    }

                    $bulkWriter->flush();
                }
            }

            return [
                'status' => 'success',
                'synced_count' => $syncedCount,
                'node_id' => $nodeId,
            ];
        } catch (\Throwable $e) {
            Log::error('FirebaseSyncService error: '.$e->getMessage());

            return [
                'status' => 'error',
                'message' => $e->getMessage(),
            ];
        }
    }
}
