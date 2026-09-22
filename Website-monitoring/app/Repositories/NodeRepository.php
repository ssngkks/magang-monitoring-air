<?php

namespace App\Repositories;

use App\Models\Node;
use App\Models\User;
use DateTimeInterface;

/* =========================================================================
 * TEMPLATE KODE LAMA FIREBASE NODE REPOSITORY (JANGAN DIHAPUS - UNTUK TEMPLATE)
 * =========================================================================
 * class NodeRepositoryFirebase extends FirestoreRepository
 * {
 *     public function __construct() { parent::__construct('nodes'); }
 *     public function createNode(array $data): string {
 *         $data['user_id'] = (string) ($data['user_id'] ?? '');
 *         $data['status'] = $data['status'] ?? 'active';
 *         $data['created_at'] = FieldValue::serverTimestamp();
 *         return $this->create($data);
 *     }
 *     public function findByKodeNode(string $kodeNode): ?array {
 *         $query = $this->where('kode_node', '=', (string) $kodeNode)->limit(1);
 *         $results = $this->get($query);
 *         return $results[0] ?? null;
 *     }
 *     public function getByUserId(string $userId): array { ... }
 *     public function updateLastSeen(string $nodeId): void { ... }
 *     public function updateStatus(string $nodeId, string $status): void { ... }
 * }
 * ========================================================================= */

class NodeRepository
{
    public function createNode(array $data): string
    {
        $node = Node::create([
            'user_id' => ! empty($data['user_id']) ? $data['user_id'] : (User::first()?->id ?? null),
            'location_id' => ! empty($data['location_id']) ? $data['location_id'] : null,
            'kode_node' => $data['kode_node'],
            'device_name' => $data['device_name'] ?? 'ESP32 Air Monitoring',
            'nama_lokasi' => $data['nama_lokasi'] ?? 'Titik Pantau Sensor Utama',
            'model_type' => $data['model_type'] ?? 'ESP32',
            'api_token_hash' => $data['api_token_hash'] ?? hash('sha256', 'default-token'),
            'status' => $data['status'] ?? 'active',
            'firmware_version' => $data['firmware_version'] ?? '1.0.0',
            'last_seen_at' => null,
        ]);

        return (string) $node->id;
    }

    public function findByKodeNode(string $kodeNode): ?array
    {
        $node = Node::with(['location', 'sensors'])->where('kode_node', $kodeNode)->first();

        return $node ? $node->toArray() : null;
    }

    public function find(string|int $id): ?array
    {
        $node = is_numeric($id)
            ? Node::with(['location', 'sensors'])->find($id)
            : Node::with(['location', 'sensors'])->where('kode_node', $id)->first();

        return $node ? $node->toArray() : null;
    }

    public function getByUserId(?string $userId = null): array
    {
        // Dalam sistem monitoring tandon air, seluruh perangkat tandon dapat diakses
        // oleh semua operator/pengguna sistem yang terautentikasi.
        return Node::with(['location', 'sensors'])
            ->orderBy('created_at', 'desc')
            ->get()
            ->toArray();
    }

    public function getAll(): array
    {
        return Node::with(['location', 'sensors'])
            ->orderBy('created_at', 'desc')
            ->get()
            ->toArray();
    }

    public function getActiveNodes(): array
    {
        return Node::with(['location', 'sensors'])
            ->where('status', 'active')
            ->get()
            ->toArray();
    }

    public function updateLastSeen(string $nodeId): void
    {
        if (is_numeric($nodeId)) {
            Node::where('id', $nodeId)->update(['last_seen_at' => now()]);
        } else {
            Node::where('kode_node', $nodeId)->orWhere('id', $nodeId)->update(['last_seen_at' => now()]);
        }
    }

    public function updateStatus(string $nodeId, string $status): void
    {
        if (is_numeric($nodeId)) {
            Node::where('id', $nodeId)->update(['status' => $status]);
        } else {
            Node::where('kode_node', $nodeId)->orWhere('id', $nodeId)->update(['status' => $status]);
        }
    }

    public function update(string $nodeId, array $data): bool
    {
        if (is_numeric($nodeId)) {
            return (bool) Node::where('id', $nodeId)->update($data);
        }

        return (bool) Node::where('kode_node', $nodeId)->orWhere('id', $nodeId)->update($data);
    }

    public function delete(string $nodeId): bool
    {
        if (is_numeric($nodeId)) {
            return (bool) Node::where('id', $nodeId)->delete();
        }

        return (bool) Node::where('kode_node', $nodeId)->orWhere('id', $nodeId)->delete();
    }

    public function getNodeWithLiveData(string $nodeId): ?array
    {
        $node = $this->find($nodeId);
        if (! $node) {
            return null;
        }

        $liveRepo = new NodeLiveRepository;
        $live = $liveRepo->find((string) ($node['id'] ?? $nodeId));
        if ($live) {
            $node['last_reading'] = $live['last_reading'] ?? null;
            $node['is_online'] = $live['is_online'] ?? false;
        } else {
            $node['is_online'] = $this->isOnline($node);
        }

        return $node;
    }

    public function isOnline(array $node, int $thresholdMinutes = 5): bool
    {
        if (empty($node['last_seen_at'])) {
            return false;
        }

        $lastSeen = $node['last_seen_at'];
        if (is_string($lastSeen)) {
            try {
                $lastSeen = new \DateTime($lastSeen);
            } catch (\Throwable $e) {
                return false;
            }
        }

        if (! $lastSeen instanceof DateTimeInterface) {
            return false;
        }

        $now = time();
        $seen = $lastSeen->getTimestamp();
        $diffSec = $now - $seen;

        return $diffSec >= -30 && $diffSec <= ($thresholdMinutes * 60);
    }
}
