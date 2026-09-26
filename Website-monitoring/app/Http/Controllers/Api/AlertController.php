<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Repositories\AlertRepository;
use App\Repositories\NodeRepository;
use Google\Cloud\Core\Timestamp;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class AlertController extends Controller
{
    public function __construct(
        protected AlertRepository $alertRepo,
        protected NodeRepository $nodeRepo,
    ) {}

    public function index(Request $request)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));

        $request->validate([
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
            'is_read' => ['nullable', 'boolean'],
            'node_id' => ['nullable', 'string', 'max:100'],
        ]);

        $isRead = $request->has('is_read') ? $request->boolean('is_read') : null;
        $perPage = $request->integer('per_page', 25);
        $nodeId = $request->input('node_id');

        if ($nodeId !== null && $nodeId !== '') {
            // Filter node dikerjakan server-side. Sengaja tanpa cache karena
            // invalidasi cache per-node tidak dapat dienumerasi dengan aman;
            // query ringan (order + limit) sehingga direct call dapat diterima.
            $alerts = $this->alertRepo->getByNodeId($nodeId, $isRead, $perPage);
        } else {
            // Cache daftar alert user selama 3 detik untuk respons instan
            $cacheKey = "alerts_{$userId}_".($isRead === null ? 'all' : ($isRead ? 'read' : 'unread'))."_{$perPage}";
            $alerts = Cache::remember($cacheKey, 3, function () use ($userId, $isRead, $perPage) {
                return $this->alertRepo->getByUserId($userId, $isRead, $perPage);
            });
        }

        // Preload nodes milik user dengan cache 30 detik untuk menghindari query berulang
        $userNodes = Cache::remember("user_nodes_{$userId}", 30, function () use ($userId) {
            return $this->nodeRepo->getByUserId($userId);
        });
        $nodeMap = [];
        foreach ($userNodes as $n) {
            $nodeMap[$n['id']] = $n;
        }

        $data = array_map(function (array $alert) use ($nodeMap) {
            $nodeId = $alert['node_id'] ?? null;
            $nodeInfo = $nodeMap[$nodeId] ?? null;

            return [
                'id' => $alert['id'],
                'node_id' => $nodeId,
                'pesan' => $alert['pesan'] ?? '',
                'severity' => $alert['severity'] ?? 'warning',
                'status' => $alert['status'] ?? 'active',
                'is_read' => (bool) ($alert['is_read'] ?? false),
                'created_at' => $this->formatTimestamp($alert['created_at'] ?? null),
                'node' => $nodeInfo ? [
                    'id' => $nodeInfo['id'],
                    'kode_node' => $nodeInfo['kode_node'] ?? '',
                    'nama_lokasi' => $nodeInfo['nama_lokasi'] ?? '',
                ] : null,
            ];
        }, $alerts);

        return response()->json([
            'data' => $data,
            'meta' => [
                'per_page' => $perPage,
                'total' => count($data),
            ],
        ]);
    }

    public function markRead(Request $request, string $alertId)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));

        $alert = $this->alertRepo->find($alertId);
        if (! $alert) {
            return response()->json(['message' => 'Alert tidak ditemukan.'], 404);
        }

        // §1.3: tanpa ownership — user login mana pun boleh menandai alert dibaca.
        // (Sebelumnya abort_unless user_id selalu 403 karena tabel alerts tak punya user_id.)

        $this->alertRepo->markAsRead($alertId);
        $alert['is_read'] = true;

        $this->forgetAlertsCache($userId);

        return response()->json(['data' => $alert]);
    }

    /**
     * Tandai SEMUA alert belum dibaca dalam 1 query — pengganti N request PATCH
     * berurutan yang antre lama di server development single-thread.
     */
    public function markAllRead(Request $request)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));

        $request->validate([
            'node_id' => ['nullable', 'string', 'max:100'],
        ]);

        $count = $this->alertRepo->markAllAsRead($request->input('node_id'));

        $this->forgetAlertsCache($userId);

        return response()->json([
            'message' => $count > 0 ? "{$count} peringatan ditandai dibaca." : 'Tidak ada peringatan belum dibaca.',
            'count' => $count,
        ]);
    }

    protected function forgetAlertsCache(string $userId): void
    {
        foreach (['all', 'read', 'unread'] as $scope) {
            foreach ([25, 100, 200] as $perPage) {
                Cache::forget("alerts_{$userId}_{$scope}_{$perPage}");
            }
        }
        Cache::forget("user_nodes_{$userId}");
    }

    private function formatTimestamp($timestamp): ?string
    {
        if (! $timestamp) {
            return null;
        }

        if ($timestamp instanceof Timestamp) {
            return $timestamp->get()->format(\DateTime::ATOM);
        }

        if ($timestamp instanceof \DateTimeInterface) {
            return $timestamp->format(\DateTime::ATOM);
        }

        if (is_numeric($timestamp)) {
            $sec = strlen((string) (int) $timestamp) > 10 ? (int) ($timestamp / 1000) : (int) $timestamp;

            return (new \DateTime("@$sec"))->format(\DateTime::ATOM);
        }

        if (is_string($timestamp)) {
            return (new \DateTime($timestamp))->format(\DateTime::ATOM);
        }

        return null;
    }
}
