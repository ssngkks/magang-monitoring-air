<?php

namespace App\Repositories;

use App\Models\Node;
use App\Models\SensorData;
use Illuminate\Support\Facades\Cache;

/* =========================================================================
 * TEMPLATE KODE LAMA FIREBASE NODE LIVE REPOSITORY (JANGAN DIHAPUS - UNTUK TEMPLATE)
 * =========================================================================
 * class NodeLiveRepositoryFirebase extends FirestoreRepository
 * {
 *     public function __construct() { parent::__construct('nodes_live'); }
 *     public function updateLiveData(string $nodeId, array $reading, ?string $userId = null): void {
 *         $data = [
 *             'kode_node' => $reading['kode_node'] ?? '',
 *             'last_reading' => $reading,
 *             'last_seen_at' => FieldValue::serverTimestamp(),
 *             'is_online' => true,
 *         ];
 *         $this->doc($nodeId)->set($data, ['merge' => true]);
 *     }
 *     public function markOffline(string $nodeId): void { ... }
 * }
 * ========================================================================= */

class NodeLiveRepository
{
    public function updateLiveData(string|int $nodeId, array $reading, ?string $userId = null): void
    {
        $cacheKey = "node_live_{$nodeId}";
        $data = [
            'id' => (string) $nodeId,
            'kode_node' => $reading['kode_node'] ?? 'ESP32-WATER-01',
            'nama_lokasi' => $reading['nama_lokasi'] ?? 'Titik Pantau Sensor Utama',
            'last_reading' => $reading,
            'last_seen_at' => now()->toIso8601String(),
            'is_online' => true,
            'updated_at' => now()->toIso8601String(),
        ];

        Cache::put($cacheKey, $data, now()->addMinutes(15));
        if (isset($reading['kode_node'])) {
            Cache::put('node_live_'.$reading['kode_node'], $data, now()->addMinutes(15));
        }
    }

    public function find(string|int $nodeId): ?array
    {
        $found = $this->findMany(is_numeric($nodeId) ? [(int) $nodeId] : [$nodeId]);

        return $found[array_key_first($found)] ?? null;
    }

    /**
     * Ambil live-data banyak node sekaligus: cache dulu, sisa yang miss
     * diambil dalam SATU query batch (anti N+1 di daftar perangkat).
     *
     * @return array<string|int, array> key = id numerik node
     */
    public function findMany(array $nodeIds): array
    {
        $out = [];
        $missIds = [];
        $missKodes = [];
        foreach ($nodeIds as $id) {
            $cached = Cache::get("node_live_{$id}");
            if ($cached) {
                $out[is_numeric($id) ? (int) $id : $id] = $cached;
            } elseif (is_numeric($id)) {
                $missIds[] = (int) $id;
            } else {
                $missKodes[] = (string) $id;
            }
        }

        if ($missIds === [] && $missKodes === []) {
            return $out;
        }

        $nodes = Node::query()
            ->when($missIds !== [], fn ($q) => $q->whereIn('id', $missIds))
            ->when($missKodes !== [], fn ($q) => $q->orWhereIn('kode_node', $missKodes))
            ->get()
            ->keyBy('id');

        if ($nodes->isEmpty()) {
            return $out;
        }

        // Satu query: id bacaan terbaru per node (GROUP BY + MAX).
        $latestIds = SensorData::whereIn('node_id', $nodes->keys()->all())
            ->groupBy('node_id')
            ->selectRaw('node_id, MAX(id) as max_id')
            ->pluck('max_id', 'node_id');
        $latestRows = $latestIds->isEmpty()
            ? collect()
            : SensorData::whereIn('id', $latestIds->values()->all())->get()->keyBy('node_id');

        foreach ($nodes as $node) {
            $latestReading = $latestRows->get($node->id);
            if (! $latestReading) {
                continue;
            }
            $meta = is_array($latestReading->metadata) ? $latestReading->metadata : (json_decode($latestReading->metadata ?? '[]', true) ?: []);
            $readingArray = [
                'id' => (string) $latestReading->id,
                'node_id' => (string) $node->id,
                'kode_node' => $node->kode_node,
                'ph' => $latestReading->ph,
                'temp' => $latestReading->temp,
                'suhu' => $latestReading->temp,
                'humidity' => $latestReading->humidity,
                'kelembapan' => $latestReading->humidity,
                'turbidity' => $latestReading->turbidity,
                'water_level' => $latestReading->water_level,
                'ketinggian_air' => $latestReading->water_level,
                'vibration' => (bool) $latestReading->vibration,
                'ai_status' => $latestReading->ai_status,
                'rssi' => $meta['rssi'] ?? -45,
                'snr' => $meta['snr'] ?? 10.0,
                'created_at' => $latestReading->created_at ? $latestReading->created_at->toIso8601String() : now()->toIso8601String(),
            ];

            $diffSec = $latestReading->created_at ? now()->diffInSeconds($latestReading->created_at) : 999;
            $out[$node->id] = [
                'id' => (string) $node->id,
                'kode_node' => $node->kode_node,
                'nama_lokasi' => $node->nama_lokasi,
                'last_reading' => $readingArray,
                'last_seen_at' => ($node->last_seen_at ?? $latestReading->created_at)?->toIso8601String(),
                'is_online' => $diffSec <= 300,
            ];
        }

        return $out;
    }

    public function markOffline(string|int $nodeId): void
    {
        Cache::forget("node_live_{$nodeId}");
    }
}
