<?php

namespace App\Repositories;

use App\Models\Alert;
use App\Models\Node;

/* =========================================================================
 * TEMPLATE KODE LAMA FIREBASE ALERT REPOSITORY (JANGAN DIHAPUS - UNTUK TEMPLATE)
 * =========================================================================
 * class AlertRepositoryFirebase extends FirestoreRepository
 * {
 *     public function __construct() { parent::__construct('alerts'); }
 *     public function createAlert(array $data): string {
 *         $data['created_at'] = $data['created_at'] ?? FieldValue::serverTimestamp();
 *         return $this->create($data);
 *     }
 *     public function getByNodeId(string $nodeId, ?bool $isRead = null, int $limit = 50): array { ... }
 *     public function getByUserId(string $userId, ?bool $isRead = null, int $perPage = 25): array { ... }
 *     public function markAsRead(string $alertId): void { ... }
 * }
 * ========================================================================= */

class AlertRepository
{
    protected function resolveNodeId(string|int $nodeId): ?int
    {
        if (is_numeric($nodeId)) {
            return (int) $nodeId;
        }

        $node = Node::where('kode_node', $nodeId)->first();
        if ($node) {
            return $node->id;
        }

        $first = Node::first();

        return $first ? $first->id : null;
    }

    public function createAlert(array $data): string
    {
        $nodeId = $this->resolveNodeId($data['node_id'] ?? 1) ?? 1;

        $alert = Alert::create([
            'node_id' => $nodeId,
            'pesan' => $data['pesan'] ?? 'Terdeteksi anomali pada tandon air.',
            'severity' => in_array($data['severity'] ?? '', ['critical', 'warning']) ? $data['severity'] : 'warning',
            'is_read' => (bool) ($data['is_read'] ?? false),
        ]);

        return (string) $alert->id;
    }

    public function getByNodeId(string|int $nodeId, ?bool $isRead = null, int $limit = 50): array
    {
        $query = Alert::with('node')->orderBy('created_at', 'desc');

        if ((string) $nodeId !== 'all') {
            $numericId = $this->resolveNodeId($nodeId);
            if ($numericId) {
                $query->where('node_id', $numericId);
            }
        }

        if ($isRead !== null) {
            $query->where('is_read', $isRead);
        }

        return $query->limit($limit)->get()->map(function ($row) {
            return [
                'id' => (string) $row->id,
                'node_id' => (string) $row->node_id,
                'kode_node' => $row->node?->kode_node ?? 'ESP32-WATER-01',
                'pesan' => $row->pesan,
                'severity' => $row->severity,
                'status' => $row->is_read ? 'read' : 'active',
                'is_read' => (bool) $row->is_read,
                'created_at' => $row->created_at ? $row->created_at->toIso8601String() : now()->toIso8601String(),
            ];
        })->toArray();
    }

    public function getByUserId(string|int $userId, ?bool $isRead = null, int $perPage = 25): array
    {
        $query = Alert::with('node')->orderBy('created_at', 'desc');

        if ($isRead !== null) {
            $query->where('is_read', $isRead);
        }

        return $query->limit($perPage)->get()->map(function ($row) {
            return [
                'id' => (string) $row->id,
                'node_id' => (string) $row->node_id,
                'kode_node' => $row->node?->kode_node ?? 'ESP32-WATER-01',
                'pesan' => $row->pesan,
                'severity' => $row->severity,
                'status' => $row->is_read ? 'read' : 'active',
                'is_read' => (bool) $row->is_read,
                'created_at' => $row->created_at ? $row->created_at->toIso8601String() : now()->toIso8601String(),
            ];
        })->toArray();
    }

    public function markAsRead(string|int $alertId): void
    {
        Alert::where('id', $alertId)->update(['is_read' => true]);
    }

    public function markActioned(string|int $alertId, string|int $userId): void
    {
        Alert::where('id', $alertId)->update(['is_read' => true]);
    }

    public function getActiveByNodeId(string|int $nodeId): ?array
    {
        $alerts = $this->getByNodeId($nodeId, false, 1);

        return $alerts[0] ?? null;
    }

    public function getUnreadCountByUserId(string|int $userId): int
    {
        return Alert::where('is_read', false)->count();
    }
}
