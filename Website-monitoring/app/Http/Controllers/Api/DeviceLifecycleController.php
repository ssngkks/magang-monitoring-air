<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Repositories\NodeRepository;
use App\Repositories\OtaUpdateRepository;
use App\Services\SensorReconcileService;
use Illuminate\Http\Request;

class DeviceLifecycleController extends Controller
{
    public function __construct(
        protected NodeRepository $nodeRepo,
        protected SensorReconcileService $reconcile,
        protected OtaUpdateRepository $otaRepo,
    ) {}

    /**
     * Sinkronisasi status OTA dari versi yang dilaporkan device: tutup job aktif
     * yang targetnya sudah tercapai. Self-healing untuk laporan yang hilang.
     */
    protected function reconcileOtaStatus(string $kodeNode, ?string $reportedVersion): void
    {
        if ($reportedVersion !== null && $reportedVersion !== '') {
            $this->otaRepo->reconcileByReportedVersion($kodeNode, $reportedVersion);
        }
    }

    /**
     * Dipanggil SEKALI saat ESP32 boot & WiFi connect (audit.md §5.1–§5.3).
     * device_id dipakai langsung sebagai kode_node (§4) — TANPA kolom baru.
     */
    public function hello(Request $request)
    {
        // Anti-hantu: ID sampah ("0", noise LoRa ter-parse) DITOLAK di pintu —
        // minimal 3 karakter alfanumerik. ID legit (ESP32-NODE-01) lolos.
        $validated = $request->validate([
            'device_id' => ['required', 'string', 'min:3', 'max:50', 'regex:/^[A-Za-z0-9][A-Za-z0-9_\-]*$/'],
            'device_role' => ['nullable', 'string', 'in:node,gateway'],
            'device_key' => ['required', 'string'],
            'firmware_version' => ['nullable', 'string', 'max:30'],
            'hardware_id' => ['nullable', 'string', 'max:50'],
            'ip_address' => ['nullable', 'string', 'max:45'],
            'capabilities' => ['nullable', 'array'],
            'capabilities.*' => ['string', 'max:50'],
        ], [
            'device_id.min' => 'Identitas device minimal 3 karakter.',
            'device_id.regex' => 'Identitas device hanya boleh huruf, angka, strip, dan underscore.',
        ]);

        // §7: device_key wajib cocok dengan DEVICE_KEY server (hash, hash_equals).
        $expected = (string) config('watermonitoring.device_key', '');
        if ($expected === '' || ! hash_equals(hash('sha256', $expected), hash('sha256', $validated['device_key']))) {
            return response()->json(['message' => 'Device key tidak valid.'], 401);
        }

        $kode = $validated['device_id'];
        $role = $validated['device_role'] ?? 'node';
        $info = [
            'firmware_version' => $validated['firmware_version'] ?? '1.0.0',
            'hardware_id' => $validated['hardware_id'] ?? null,
            'ip_address' => $validated['ip_address'] ?? $request->ip(),
            'capabilities' => isset($validated['capabilities']) ? array_values($validated['capabilities']) : null,
            'api_token_hash' => hash('sha256', $validated['device_key']),
            'last_seen_at' => now(),
        ];

        $node = $this->nodeRepo->findByKodeNode($kode);

        // §5.3: tak dikenal → SELALU pending. TIDAK PERNAH active, TIDAK PERNAH
        // dianggap node lain (BUG-2/BUG-3 fix).
        if (! $node) {
            $id = $this->nodeRepo->createNode(array_merge($info, [
                'kode_node' => $kode,
                'device_name' => 'Perangkat Baru '.$kode,
                'model_type' => $role === 'gateway' ? 'ESP32 Gateway (LoRa)' : 'Node Sensor',
                'device_role' => $role,
                'status' => 'pending',
            ]));

            return response()->json([
                'status' => 'pending',
                'message' => 'Menunggu registrasi di dashboard.',
                'data' => $this->nodeRepo->find($id),
            ], 202);
        }

        if (($node['status'] ?? '') === 'inactive') {
            return response()->json(['message' => 'Device dinonaktifkan.'], 403);
        }

        $this->nodeRepo->update($node['id'], $info);
        $node = $this->nodeRepo->find($node['id']);
        $this->reconcileOtaStatus($kode, $node['firmware_version'] ?? null);

        // §5.4: entry yang sudah dibuat di web duluan (punya lokasi) langsung active
        // saat hello pertama cocok — tanpa klik Daftarkan lagi.
        if (($node['status'] ?? '') === 'pending') {
            if (! empty($node['location_id'])) {
                $this->nodeRepo->update($node['id'], ['status' => 'active']);
                $node = $this->nodeRepo->find($node['id']);
                $summary = $this->reconcile->reconcile($node, $node['capabilities'] ?? []);

                return response()->json([
                    'status' => 'active',
                    'message' => 'Device terdaftar (pra-registrasi cocok), sensor direkonsiliasi.',
                    'data' => $node,
                    'sensors' => $summary,
                ]);
            }

            return response()->json([
                'status' => 'pending',
                'message' => 'Menunggu registrasi di dashboard.',
                'data' => $node,
            ], 202);
        }

        return response()->json(['status' => 'active', 'data' => $node]);
    }

    /**
     * Dipanggil tiap ±15 detik selama menyala (§5.6). Hanya sentuh last_seen_at —
     * TIDAK mengubah status registrasi pending/active/inactive.
     */
    public function heartbeat(Request $request)
    {
        $validated = $request->validate([
            'device_id' => ['required', 'string', 'max:50'],
            'device_key' => ['required', 'string'],
            'uptime' => ['nullable', 'integer', 'min:0'],
            'wifi_rssi' => ['nullable', 'integer'],
            'firmware_version' => ['nullable', 'string', 'max:30'],
        ]);

        $node = $this->nodeRepo->findByKodeNode($validated['device_id']);
        if (! $node) {
            return response()->json([
                'message' => 'Device belum terdaftar. Lakukan POST /api/devices/hello terlebih dahulu.',
            ], 404);
        }

        // Hash diambil terpisah karena di-hidden dari toArray() (anti-bocor ke response).
        $storedHash = $this->nodeRepo->getTokenHashByKodeNode($validated['device_id']);
        if ($storedHash === null || ! hash_equals($storedHash, hash('sha256', $validated['device_key']))) {
            return response()->json(['message' => 'Device key tidak valid.'], 401);
        }

        $heartbeatUpdate = ['last_seen_at' => now()];
        if (! empty($validated['firmware_version'])) {
            $heartbeatUpdate['firmware_version'] = $validated['firmware_version'];
        }
        $this->nodeRepo->update($node['id'], $heartbeatUpdate);
        $node = $this->nodeRepo->find($node['id']);
        $this->reconcileOtaStatus($validated['device_id'], $node['firmware_version'] ?? null);
        $conn = $this->nodeRepo->connectionStatus($node);

        return response()->json([
            'status' => $node['status'],
            'connection' => $conn['state'],
            'last_seen_at' => $node['last_seen_at'],
        ]);
    }

    /**
     * Daftar perangkat menunggu registrasi — sumber section
     * "Perangkat Baru Ditemukan" di dashboard (§5.5).
     */
    public function pending()
    {
        $nodes = $this->nodeRepo->getPending();
        $data = array_map(function (array $n) {
            $conn = $this->nodeRepo->connectionStatus($n);

            return array_merge($n, [
                'connection' => $conn['state'],
                'seconds_ago' => $conn['seconds_ago'],
            ]);
        }, $nodes);

        return response()->json(['data' => $data]);
    }

    /**
     * Klik "Daftarkan" (§5.5): pending → active. Mode Otomatis langsung
     * reconcile sensor dari capabilities hello (§6.1).
     */
    public function register(Request $request, string $id)
    {
        $node = $this->nodeRepo->find($id);
        if (! $node) {
            return response()->json(['message' => 'Perangkat tidak ditemukan.'], 404);
        }

        $validated = $request->validate([
            'device_name' => ['nullable', 'string', 'max:100'],
            'device_type_id' => ['nullable', 'exists:device_types,id'],
            'location_id' => ['nullable', 'exists:locations,id'],
            'model_type' => ['nullable', 'string', 'max:50'],
            'sensor_mode' => ['nullable', 'string', 'in:auto,manual'],
        ]);

        $this->nodeRepo->update($id, array_filter([
            'device_name' => $validated['device_name'] ?? $node['device_name'] ?? null,
            'device_type_id' => $validated['device_type_id'] ?? null,
            'location_id' => $validated['location_id'] ?? null,
            'model_type' => $validated['model_type'] ?? null,
            'status' => 'active',
        ], fn ($v) => $v !== null));

        $node = $this->nodeRepo->find($id);
        $summary = null;
        if (($validated['sensor_mode'] ?? 'auto') === 'auto') {
            $summary = $this->reconcile->reconcile($node, $node['capabilities'] ?? []);
        }

        return response()->json([
            'message' => 'Perangkat berhasil didaftarkan.',
            'data' => $node,
            'sensors' => $summary,
        ]);
    }

    /**
     * Klik "Abaikan" (§5.5): bukan hapus — set inactive agar bisa di-reaktivasi.
     */
    public function ignore(string $id)
    {
        $node = $this->nodeRepo->find($id);
        if (! $node) {
            return response()->json(['message' => 'Perangkat tidak ditemukan.'], 404);
        }

        $this->nodeRepo->update($id, ['status' => 'inactive']);

        return response()->json(['message' => 'Perangkat diabaikan (nonaktif, bisa diaktifkan lagi).']);
    }
}
