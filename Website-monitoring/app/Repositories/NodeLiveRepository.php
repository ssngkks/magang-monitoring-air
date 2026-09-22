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
        $cached = Cache::get("node_live_{$nodeId}");
        if ($cached) {
            return $cached;
        }

        // Fallback ke data sensor terbaru dari MySQL
        $node = is_numeric($nodeId)
            ? Node::find($nodeId)
            : Node::where('kode_node', $nodeId)->first();

        if ($node) {
            $latestReading = SensorData::where('node_id', $node->id)->latest('created_at')->first();
            if ($latestReading) {
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
                $isOnline = $diffSec <= 300;

                return [
                    'id' => (string) $node->id,
                    'kode_node' => $node->kode_node,
                    'nama_lokasi' => $node->nama_lokasi,
                    'last_reading' => $readingArray,
                    'last_seen_at' => ($node->last_seen_at ?? $latestReading->created_at)?->toIso8601String(),
                    'is_online' => $isOnline,
                ];
            }
        }

        return null;
    }

    public function markOffline(string|int $nodeId): void
    {
        Cache::forget("node_live_{$nodeId}");
    }
}
