<?php

namespace App\Repositories;

use App\Models\Node;
use App\Models\SensorData;

/* =========================================================================
 * TEMPLATE KODE LAMA FIREBASE SENSOR DATA REPOSITORY (JANGAN DIHAPUS - UNTUK TEMPLATE)
 * =========================================================================
 * class SensorDataRepositoryFirebase extends FirestoreRepository
 * {
 *     public function __construct() { parent::__construct('sensor_readings'); }
 *     public function createReading(array $data): string {
 *         $data['received_at'] = FieldValue::serverTimestamp();
 *         $data['created_at'] = FieldValue::serverTimestamp();
 *         return $this->create($data);
 *     }
 *     public function fetchFromRealtimeDatabase(int $limit = 1000): ?array {
 *         $history = $rtdb->getReference('/sensor/history')->orderByKey()->limitToLast($limit)->getValue();
 *         ...
 *     }
 *     public function getByNodeId(string $nodeId, int $limit = 1000, ?string $from = null, ?string $to = null): array { ... }
 *     public function getLatestByNodeId(string $nodeId): ?array { ... }
 * }
 * ========================================================================= */

class SensorDataRepository
{
    /**
     * Helper untuk menyelesaikan ID numeric node dari ID string / kode_node.
     *
     * BUG-2 fix (audit.md §9): TIDAK ADA fallback ke Node::first(). Kode yang tidak
     * dikenal mengembalikan null — caller WAJIB menolak (404/403), bukan menyimpan
     * ke node lain. Device_id dipakai langsung sebagai kode_node (§4).
     */
    protected function resolveNodeId(string|int $nodeId): ?int
    {
        if (is_numeric($nodeId)) {
            return Node::where('id', (int) $nodeId)->exists() ? (int) $nodeId : null;
        }

        $node = Node::where('kode_node', $nodeId)->first();

        return $node ? $node->id : null;
    }

    public function createReading(array $data): string
    {
        $rawNodeId = $data['node_id'] ?? null;
        $numericNodeId = $rawNodeId !== null ? $this->resolveNodeId($rawNodeId) : null;

        if (! $numericNodeId) {
            // §9: tolak — JANGAN auto-create, JANGAN simpan ke node lain (BUG-1/BUG-2).
            throw new \InvalidArgumentException('Node tidak dikenal atau belum terdaftar aktif.');
        }

        $thresholdVib = (float) config('watermonitoring.vibration_rms_threshold', 0.30);
        $vibrationRms = (float) ($data['vibration_rms'] ?? ($data['getaran'] ?? 0));
        $vibration = $vibrationRms >= $thresholdVib || (! empty($data['vibration']) && $data['vibration'] === true) || ((int) ($data['getaran'] ?? 0) > 0);

        $reading = SensorData::create([
            'node_id' => $numericNodeId,
            'ph' => isset($data['ph']) ? (float) $data['ph'] : null,
            'temp' => isset($data['temp']) ? (float) $data['temp'] : (isset($data['suhu']) ? (float) $data['suhu'] : null),
            'humidity' => isset($data['humidity']) ? (float) $data['humidity'] : (isset($data['kelembapan']) ? (float) $data['kelembapan'] : null),
            'turbidity' => isset($data['turbidity']) ? (float) $data['turbidity'] : null,
            'water_level' => isset($data['water_level']) ? (float) $data['water_level'] : (isset($data['ketinggian_air']) ? (float) $data['ketinggian_air'] : null),
            'vibration' => $vibration,
            'ai_status' => $data['ai_status'] ?? 'Normal',
            'mpu_x' => isset($data['mpu_x']) ? (float) $data['mpu_x'] : (isset($data['acc_x']) ? (float) $data['acc_x'] : null),
            'mpu_y' => isset($data['mpu_y']) ? (float) $data['mpu_y'] : (isset($data['acc_y']) ? (float) $data['acc_y'] : null),
            'mpu_z' => isset($data['mpu_z']) ? (float) $data['mpu_z'] : (isset($data['acc_z']) ? (float) $data['acc_z'] : null),
            'roll' => isset($data['roll']) ? (float) $data['roll'] : null,
            'pitch' => isset($data['pitch']) ? (float) $data['pitch'] : null,
            'yaw' => isset($data['yaw']) ? (float) $data['yaw'] : null,
            'stability_status' => $data['stability_status'] ?? ($data['stab'] ?? 'Stabil'),
            'metadata' => [
                'rssi' => $data['rssi'] ?? -45,
                'snr' => $data['snr'] ?? 10.0,
                'ai_confidence' => $data['ai_confidence'] ?? 98.5,
                'ai_diagnosis' => $data['ai_diagnosis'] ?? 'Normal',
                'vibration_rms' => $vibrationRms,
            ],
            'created_at' => now(),
        ]);

        return (string) $reading->id;
    }

    public function getByNodeId(string|int $nodeId, int $limit = 1000, ?string $from = null, ?string $to = null): array
    {
        $query = SensorData::with('node')->orderBy('created_at', 'desc');

        if ((string) $nodeId !== 'all') {
            $numericId = $this->resolveNodeId($nodeId);
            if (! $numericId) {
                return []; // kode tak dikenal → kosong, bukan data node lain (BUG-2)
            }
            $query->where('node_id', $numericId);
        }

        if ($from) {
            $query->where('created_at', '>=', $from);
        }
        if ($to) {
            $query->where('created_at', '<=', $to);
        }

        $items = $query->limit($limit)->get();

        return $items->map(function ($row) {
            $meta = is_array($row->metadata) ? $row->metadata : (json_decode($row->metadata ?? '[]', true) ?: []);

            return [
                'id' => (string) $row->id,
                'node_id' => (string) $row->node_id,
                'kode_node' => $row->node?->kode_node ?? 'ESP32-WATER-01',
                'ph' => $row->ph !== null ? (float) $row->ph : null,
                'temp' => $row->temp !== null ? (float) $row->temp : null,
                'suhu' => $row->temp !== null ? (float) $row->temp : null,
                'humidity' => $row->humidity !== null ? (float) $row->humidity : null,
                'kelembapan' => $row->humidity !== null ? (float) $row->humidity : null,
                'turbidity' => $row->turbidity !== null ? (float) $row->turbidity : null,
                'water_level' => $row->water_level !== null ? (float) $row->water_level : null,
                'ketinggian_air' => $row->water_level !== null ? (float) $row->water_level : null,
                'vibration' => (bool) $row->vibration,
                'vibration_rms' => (float) ($meta['vibration_rms'] ?? 0),
                'ai_status' => $row->ai_status ?? 'Normal',
                'ai_confidence' => (float) ($meta['ai_confidence'] ?? 98.0),
                'ai_diagnosis' => $meta['ai_diagnosis'] ?? 'Parameter stabil.',
                'rssi' => $meta['rssi'] ?? -45,
                'snr' => $meta['snr'] ?? 10.0,
                'mpu_x' => $row->mpu_x !== null ? (float) $row->mpu_x : null,
                'mpu_y' => $row->mpu_y !== null ? (float) $row->mpu_y : null,
                'mpu_z' => $row->mpu_z !== null ? (float) $row->mpu_z : null,
                'roll' => $row->roll !== null ? (float) $row->roll : null,
                'pitch' => $row->pitch !== null ? (float) $row->pitch : null,
                'yaw' => $row->yaw !== null ? (float) $row->yaw : null,
                'stability_status' => $row->stability_status ?? 'Stabil',
                'created_at' => $row->created_at ? $row->created_at->toIso8601String() : now()->toIso8601String(),
                'received_at' => $row->created_at ? $row->created_at->toIso8601String() : now()->toIso8601String(),
            ];
        })->toArray();
    }

    public function getLatestByNodeId(string|int $nodeId): ?array
    {
        $rows = $this->getByNodeId($nodeId, 1);

        return $rows[0] ?? null;
    }

    public function getPaginated(string|int $nodeId, int $perPage = 25, ?string $cursor = null, ?string $from = null, ?string $to = null): array
    {
        $all = $this->getByNodeId($nodeId, 1000, $from, $to);
        $total = count($all);

        $startIndex = 0;
        if ($cursor) {
            foreach ($all as $idx => $r) {
                if (($r['id'] ?? '') === $cursor || ($r['created_at'] ?? '') === $cursor) {
                    $startIndex = $idx + 1;
                    break;
                }
            }
        }

        $results = array_slice($all, $startIndex, $perPage);
        $hasMore = ($startIndex + count($results)) < $total;

        return [
            'data' => $results,
            'has_more' => $hasMore,
            'total' => $total,
            'next_cursor' => $hasMore ? (string) (end($results)['id'] ?? '') : null,
        ];
    }

    public function getLast24Hours(string|int $nodeId): array
    {
        $from = now()->subHours(24)->format('Y-m-d H:i:s');

        return $this->getByNodeId($nodeId, 1000, $from);
    }
}
