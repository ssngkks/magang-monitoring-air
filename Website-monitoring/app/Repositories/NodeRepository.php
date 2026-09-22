<?php

namespace App\Repositories;

use App\Models\Node;
use DateTimeInterface;
use Illuminate\Support\Str;

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
        // BUG-3 fix (audit.md §2/§7): TIDAK ADA fallback User::first() dan TIDAK ADA
        // default-token. Prototipe ini tanpa ownership (§1.3) → user_id boleh null.
        // Token/hash wajib dipasok caller; kalau kosong, dibuatkan acak (bukan default).
        $node = Node::create([
            'user_id' => $data['user_id'] ?? null,
            'location_id' => ! empty($data['location_id']) ? $data['location_id'] : null,
            'device_type_id' => ! empty($data['device_type_id']) ? $data['device_type_id'] : null,
            'kode_node' => $data['kode_node'],
            'device_name' => $data['device_name'] ?? 'ESP32 Air Monitoring',
            'nama_lokasi' => $data['nama_lokasi'] ?? null,
            'model_type' => $data['model_type'] ?? 'ESP32',
            'device_role' => $data['device_role'] ?? 'node',
            'api_token_hash' => $data['api_token_hash'] ?? hash('sha256', Str::random(40)),
            // Default "pending" (§5.3): device tak dikenal TIDAK PERNAH langsung active.
            'status' => $data['status'] ?? 'pending',
            'firmware_version' => $data['firmware_version'] ?? '1.0.0',
            'capabilities' => $data['capabilities'] ?? null,
            'ip_address' => $data['ip_address'] ?? null,
            'hardware_id' => $data['hardware_id'] ?? null,
            'last_seen_at' => $data['last_seen_at'] ?? null,
        ]);

        return (string) $node->id;
    }

    public function findByKodeNode(string $kodeNode): ?array
    {
        $node = Node::with(['location', 'deviceType', 'sensors'])->where('kode_node', $kodeNode)->first();

        return $node ? $node->toArray() : null;
    }

    public function find(string|int $id): ?array
    {
        $node = is_numeric($id)
            ? Node::with(['location', 'deviceType', 'sensors'])->find($id)
            : Node::with(['location', 'deviceType', 'sensors'])->where('kode_node', $id)->first();

        return $node ? $node->toArray() : null;
    }

    /**
     * Hash token untuk verifikasi auth. Dipisah dari find()/toArray() karena
     * api_token_hash di-hidden dari output API (tidak boleh bocor ke response).
     */
    public function getTokenHashByKodeNode(string $kodeNode): ?string
    {
        $hash = Node::where('kode_node', $kodeNode)->value('api_token_hash');

        return is_string($hash) && $hash !== '' ? $hash : null;
    }

    /**
     * @deprecated Nama menyesatkan (tak pernah filter user). Prototipe tanpa
     * ownership — audit.md §1.3/BUG-7: semua user melihat SEMUA device.
     * Pakai getAll(). Dipertahankan sebagai wrapper agar caller lama tak pecah.
     */
    public function getByUserId(?string $userId = null): array
    {
        return $this->getAll();
    }

    public function getAll(): array
    {
        return Node::with(['location', 'deviceType', 'sensors'])
            ->orderBy('created_at', 'desc')
            ->get()
            ->toArray();
    }

    public function getPending(): array
    {
        return Node::with(['location', 'deviceType'])
            ->where('status', 'pending')
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

    /**
     * Status konektivitas 3-level dari last_seen_at (audit.md §5.6) — SATU implementasi
     * untuk SEMUA controller. Threshold detik dari config/watermonitoring.php.
     *
     * @return array{state: string, seconds_ago: ?int} state = ONLINE|STALE|OFFLINE
     */
    public function connectionStatus(array $node): array
    {
        $onlineSec = (int) config('watermonitoring.online_threshold_seconds', 45);
        $staleSec = (int) config('watermonitoring.stale_threshold_seconds', 120);

        if (empty($node['last_seen_at'])) {
            return ['state' => 'OFFLINE', 'seconds_ago' => null];
        }

        $lastSeen = $node['last_seen_at'];
        if (is_string($lastSeen)) {
            try {
                $lastSeen = new \DateTime($lastSeen);
            } catch (\Throwable $e) {
                return ['state' => 'OFFLINE', 'seconds_ago' => null];
            }
        }

        if (! $lastSeen instanceof DateTimeInterface) {
            return ['state' => 'OFFLINE', 'seconds_ago' => null];
        }

        $diffSec = time() - $lastSeen->getTimestamp();
        if ($diffSec < 0) {
            $diffSec = 0; // toleransi skew jam
        }

        if ($diffSec <= $onlineSec) {
            return ['state' => 'ONLINE', 'seconds_ago' => $diffSec];
        }

        if ($diffSec <= $staleSec) {
            return ['state' => 'STALE', 'seconds_ago' => $diffSec];
        }

        return ['state' => 'OFFLINE', 'seconds_ago' => $diffSec];
    }

    /**
     * Kompatibilitas: true hanya saat ONLINE. Parameter dalam DETIK
     * (dulu menit — BUG-6 fix: semua caller kini detik via config).
     */
    public function isOnline(array $node, ?int $thresholdSeconds = null): bool
    {
        $thresholdSeconds ??= (int) config('watermonitoring.online_threshold_seconds', 45);
        $ago = $this->connectionStatus($node)['seconds_ago'];

        return $ago !== null && $ago <= $thresholdSeconds;
    }
}
