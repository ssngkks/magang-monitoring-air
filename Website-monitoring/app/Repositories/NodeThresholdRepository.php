<?php

namespace App\Repositories;

use Illuminate\Support\Facades\Cache;

/* =========================================================================
 * TEMPLATE KODE LAMA FIREBASE NODE THRESHOLD (JANGAN DIHAPUS - UNTUK TEMPLATE)
 * =========================================================================
 * class NodeThresholdRepositoryFirebase extends FirestoreRepository
 * {
 *     public function __construct() { parent::__construct('node_thresholds'); }
 *     public function upsert(string $nodeId, array $data): void {
 *         $data['node_id'] = (string) $nodeId;
 *         $data['updated_at'] = FieldValue::serverTimestamp();
 *         $this->doc($nodeId)->set($data, ['merge' => true]);
 *     }
 * }
 * ========================================================================= */

class NodeThresholdRepository
{
    public function getByNodeId(string $nodeId): array
    {
        $cached = Cache::get("node_threshold_{$nodeId}");
        if ($cached) {
            return $cached;
        }

        return $this->getDefaults();
    }

    public function getDefaults(): array
    {
        return [
            'id' => null,
            'node_id' => null,
            'ph_min' => 6.5,
            'ph_max' => 8.5,
            'temperature_max' => 28.0,
            'turbidity_max' => 1.5,
            'water_level_min' => 80.0,
            'water_level_max' => 130.0,
        ];
    }

    public function upsert(string $nodeId, array $data): void
    {
        $merged = array_merge($this->getDefaults(), $data, ['node_id' => $nodeId]);
        Cache::put("node_threshold_{$nodeId}", $merged, now()->addDays(30));
    }

    public function getAllForUser(string $userId): array
    {
        $nodeRepo = new NodeRepository;
        $nodes = $nodeRepo->getByUserId($userId);
        $thresholds = [];
        foreach ($nodes as $node) {
            $thresholds[$node['id']] = $this->getByNodeId($node['id']);
        }

        return $thresholds;
    }
}
