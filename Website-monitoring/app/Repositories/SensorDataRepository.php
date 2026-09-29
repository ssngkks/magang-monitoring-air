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

        return $items->map(fn ($row) => $this->mapRow($row))->toArray();
    }

    /**
     * Bentuk array API satu baris sensor (satu-satunya sumber mapping —
     * dipakai getByNodeId/getPaginated/getDownsampled agar konsisten).
     */
    protected function mapRow(SensorData $row): array
    {
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
    }

    public function getLatestByNodeId(string|int $nodeId): ?array
    {
        $rows = $this->getByNodeId($nodeId, 1);

        return $rows[0] ?? null;
    }

    /**
     * Ambil ≤ $maxPoints baris yang tersebar MERATA selebar rentang [from, to]
     * (bukan N terbaru saja) — untuk chart rentang panjang pada data padat.
     * Sampling dikerjakan di SQL (pluck id 1 kolom + whereIn ≤ N baris),
     * bukan tarik 20 ribu baris ke PHP. Mengembalikan ['rows' => ..., 'total' => ...].
     */
    public function getDownsampled(string|int $nodeId, int $maxPoints, ?string $from = null, ?string $to = null): array
    {
        $maxPoints = max(10, min(500, $maxPoints));
        $numericId = ((string) $nodeId !== 'all') ? $this->resolveNodeId($nodeId) : null;
        if ((string) $nodeId !== 'all' && ! $numericId) {
            return ['rows' => [], 'total' => 0]; // kode tak dikenal → kosong (BUG-2)
        }

        $filtered = function () use ($numericId, $from, $to) {
            $q = SensorData::query()->orderBy('created_at', 'desc')->orderBy('id', 'desc');
            if ($numericId) {
                $q->where('node_id', $numericId);
            }
            if ($from) {
                $q->where('created_at', '>=', $from);
            }
            if ($to) {
                $q->where('created_at', '<=', $to);
            }

            return $q;
        };

        $total = (clone $filtered())->count();
        if ($total <= $maxPoints) {
            return ['rows' => $this->getByNodeId($nodeId, $maxPoints, $from, $to), 'total' => $total];
        }

        // Ambil hanya kolom id (murah, pakai index), lalu ambil baris terpilih.
        $ids = (clone $filtered())->pluck('id')->all();
        $step = $total / $maxPoints;
        $picked = [];
        for ($i = 0; $i < $maxPoints; $i++) {
            $picked[] = $ids[(int) floor($i * $step)];
        }
        $rows = SensorData::with('node')->whereIn('id', $picked)->orderBy('created_at', 'desc')->orderBy('id', 'desc')->get();
        $sampled = $rows->map(fn ($row) => $this->mapRow($row))->toArray();

        return ['rows' => $sampled, 'total' => $total];
    }

    /**
     * Paginasi keyset di SQL (where id < cursor, limit perPage+1) — tidak
     * pernah menarik ribuan baris ke PHP. Bentuk respons tetap sama.
     */
    public function getPaginated(string|int $nodeId, int $perPage = 25, ?string $cursor = null, ?string $from = null, ?string $to = null): array
    {
        $perPage = max(1, min(200, $perPage));
        $numericId = ((string) $nodeId !== 'all') ? $this->resolveNodeId($nodeId) : null;
        if ((string) $nodeId !== 'all' && ! $numericId) {
            return ['data' => [], 'has_more' => false, 'total' => 0, 'next_cursor' => null];
        }

        $base = function () use ($numericId, $from, $to) {
            $q = SensorData::query();
            if ($numericId) {
                $q->where('node_id', $numericId);
            }
            if ($from) {
                $q->where('created_at', '>=', $from);
            }
            if ($to) {
                $q->where('created_at', '<=', $to);
            }

            return $q;
        };

        $total = (clone $base())->count();

        // Keyset (created_at, id): cursor = "Y-m-d H:i:s|id" (opaque bagi client).
        // Cursor id polos lama tetap didukung via lookup waktunya. Tanpa ini,
        // id < cursor SALAH setiap urutan created_at tak sejalan dengan id.
        $query = $base()->with('node')->orderBy('created_at', 'desc')->orderBy('id', 'desc');
        if ($cursor !== null && $cursor !== '') {
            $cursorTime = null;
            $cursorId = null;
            if (is_numeric($cursor)) {
                $ref = SensorData::find((int) $cursor);
                if ($ref && $ref->created_at) {
                    $cursorTime = $ref->created_at->format('Y-m-d H:i:s');
                    $cursorId = (int) $cursor;
                }
            } elseif (str_contains((string) $cursor, '|')) {
                [$t, $i] = explode('|', (string) $cursor, 2);
                try {
                    $cursorTime = (new \DateTime($t))->format('Y-m-d H:i:s');
                    $cursorId = is_numeric($i) ? (int) $i : null;
                } catch (\Throwable $e) {
                    // Cursor rusak → mulai dari awal (abaikan).
                }
            } else {
                try {
                    $cursorTime = (new \DateTime($cursor))->format('Y-m-d H:i:s');
                } catch (\Throwable $e) {
                    // Cursor tak dikenal → mulai dari awal (abaikan).
                }
            }
            if ($cursorTime !== null) {
                $query->where(function ($q) use ($cursorTime, $cursorId) {
                    $q->where('created_at', '<', $cursorTime);
                    if ($cursorId !== null) {
                        $q->orWhere(function ($qq) use ($cursorTime, $cursorId) {
                            $qq->where('created_at', $cursorTime)->where('id', '<', $cursorId);
                        });
                    }
                });
            }
        }

        $fetched = $query->limit($perPage + 1)->get();
        $hasMore = $fetched->count() > $perPage;
        $page = $fetched->take($perPage)->map(fn ($row) => $this->mapRow($row))->toArray();
        $last = end($page);

        $nextCursor = null;
        if ($hasMore && $last) {
            try {
                $nextCursor = (new \DateTime($last['created_at']))->format('Y-m-d H:i:s').'|'.($last['id'] ?? '');
            } catch (\Throwable $e) {
                $nextCursor = (string) ($last['id'] ?? '');
            }
        }

        return [
            'data' => $page,
            'has_more' => $hasMore,
            'total' => $total,
            'next_cursor' => $nextCursor,
        ];
    }

    public function getLast24Hours(string|int $nodeId): array
    {
        $from = now()->subHours(24)->format('Y-m-d H:i:s');

        return $this->getByNodeId($nodeId, 1000, $from);
    }
}
