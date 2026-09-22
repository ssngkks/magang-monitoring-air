<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreNodeRequest;
use App\Repositories\NodeLiveRepository;
use App\Repositories\NodeRepository;
use App\Repositories\SensorDataRepository;
use Google\Cloud\Core\Timestamp;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class NodeController extends Controller
{
    public function __construct(
        protected NodeRepository $nodeRepo,
        protected NodeLiveRepository $nodeLiveRepo,
        protected SensorDataRepository $sensorRepo,
    ) {}

    public function index(Request $request)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));

        $thresholdMinutes = (int) config('watermonitoring.online_threshold_minutes', 10);
        $nodes = $this->nodeRepo->getByUserId($userId);

        $data = array_map(function (array $node) use ($thresholdMinutes) {
            $live = $this->nodeLiveRepo->find($node['id']);
            $liveReading = $live['last_reading'] ?? null;
            $isOnline = $this->nodeRepo->isOnline($node, $thresholdMinutes);
            if (! $isOnline && ! empty($live['is_online'])) {
                $isOnline = (bool) $live['is_online'];
            }

            // Fallback timestamp: jika node.last_seen_at null, gunakan waktu reading sensor terbaru
            $lastSeenRaw = $node['last_seen_at'] ?? ($live['last_seen_at'] ?? ($liveReading['created_at'] ?? null));

            return [
                'id' => $node['id'],
                'kode_node' => $node['kode_node'] ?? 'ESP32-WATER-01',
                'nama_lokasi' => $node['nama_lokasi'] ?? 'Titik Pantau Sensor Utama',
                'device_name' => $node['device_name'] ?? 'ESP32 Air Monitoring',
                'status' => $node['status'] ?? 'active',
                'is_online' => $isOnline,
                'connection_status' => $isOnline ? 'Terhubung' : 'Terputus',
                'last_seen_at' => $this->formatTimestamp($lastSeenRaw),
                'last_reading' => $liveReading,
                'rssi' => $liveReading['rssi'] ?? -43,
                'snr' => $liveReading['snr'] ?? 10.0,
            ];
        }, $nodes);

        return response()->json(['data' => $data]);
    }

    public function store(StoreNodeRequest $request)
    {
        $validated = $request->validated();
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));

        // Cek apakah kode_node sudah ada di Firestore
        $existing = $this->nodeRepo->findByKodeNode($validated['kode_node']);
        if ($existing) {
            return response()->json([
                'message' => 'Kode node sudah digunakan.',
                'errors' => ['kode_node' => ['Kode node sudah terdaftar.']],
            ], 422);
        }

        $tokenPlaintext = Str::random(40);

        $nodeId = $this->nodeRepo->createNode([
            'user_id' => $userId,
            'kode_node' => $validated['kode_node'],
            'nama_lokasi' => $validated['nama_lokasi'],
            'api_token_hash' => hash('sha256', $tokenPlaintext),
            'status' => 'active',
        ]);

        return response()->json([
            'message' => 'Node berhasil didaftarkan. Simpan token berikut, tidak akan ditampilkan lagi.',
            'data' => [
                'id' => $nodeId,
                'kode_node' => $validated['kode_node'],
                'nama_lokasi' => $validated['nama_lokasi'],
                'api_token' => $tokenPlaintext,
            ],
        ], 201);
    }

    public function sensorData(Request $request, string $nodeId)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));

        $node = $this->nodeRepo->find($nodeId);
        if (! $node) {
            return response()->json(['message' => 'Node tidak ditemukan.'], 404);
        }

        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $perPage = $request->integer('per_page', 25);
        $from = $request->input('from');
        $to = $request->input('to');
        $range = $request->input('range');

        if ($range) {
            $now = new \DateTime;
            if ($range === 'today') {
                $from = (new \DateTime('today 00:00:00'))->format(\DateTime::ATOM);
                $to = (new \DateTime('today 23:59:59'))->format(\DateTime::ATOM);
            } elseif ($range === '7d') {
                $from = (clone $now)->modify('-7 days')->format(\DateTime::ATOM);
                $to = $now->format(\DateTime::ATOM);
            } elseif ($range === '30d') {
                $from = (clone $now)->modify('-30 days')->format(\DateTime::ATOM);
                $to = $now->format(\DateTime::ATOM);
            }
        }

        $paginated = $this->sensorRepo->getPaginated($nodeId, $perPage, null, $from, $to);

        $rows = array_map(function (array $row) use ($node) {
            return [
                'id' => $row['id'] ?? null,
                'node' => $node['kode_node'] ?? '',
                'ph' => $row['ph'] ?? null,
                'temp' => $row['temp'] ?? null,
                'humidity' => $row['humidity'] ?? null,
                'turbidity' => $row['turbidity'] ?? null,
                'water_level' => $row['water_level'] ?? null,
                'vibration' => $row['vibration'] ?? false,
                'ai_status' => $row['ai_status'] ?? 'Normal',
                'mpu_x' => $row['mpu_x'] ?? null,
                'mpu_y' => $row['mpu_y'] ?? null,
                'mpu_z' => $row['mpu_z'] ?? null,
                'roll' => $row['roll'] ?? null,
                'pitch' => $row['pitch'] ?? null,
                'yaw' => $row['yaw'] ?? null,
                'stability_status' => $row['stability_status'] ?? 'Stabil',
                'created_at' => $this->formatTimestamp($row['created_at'] ?? $row['received_at'] ?? null),
            ];
        }, $paginated['data']);

        return response()->json([
            'data' => $rows,
            'meta' => [
                'per_page' => $perPage,
                'has_more' => $paginated['has_more'],
                'next_cursor' => $paginated['next_cursor'],
            ],
        ]);
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
