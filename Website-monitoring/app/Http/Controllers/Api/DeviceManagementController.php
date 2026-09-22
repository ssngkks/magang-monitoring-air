<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SensorType;
use App\Repositories\DeviceTypeRepository;
use App\Repositories\LocationRepository;
use App\Repositories\NodeLiveRepository;
use App\Repositories\NodeRepository;
use App\Repositories\SensorRepository;
use App\Services\SensorReconcileService;
use Database\Seeders\SensorTypeSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class DeviceManagementController extends Controller
{
    public function __construct(
        protected LocationRepository $locationRepo,
        protected NodeRepository $nodeRepo,
        protected SensorRepository $sensorRepo,
        protected DeviceTypeRepository $deviceTypeRepo,
        protected SensorReconcileService $reconcile,
    ) {}

    // ==========================================
    // LOCATIONS & SECTORS
    // ==========================================

    public function indexLocations(Request $request)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));
        $locations = $this->locationRepo->getByUserId($userId);

        return response()->json(['data' => $locations]);
    }

    public function storeLocation(Request $request)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'description' => ['nullable', 'string'],
            'address' => ['nullable', 'string'],
        ]);

        $validated['user_id'] = $userId;
        $loc = $this->locationRepo->create($validated);

        return response()->json([
            'message' => 'Lokasi / Sektor berhasil ditambahkan.',
            'data' => $loc,
        ], 201);
    }

    public function updateLocation(Request $request, $id)
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'description' => ['nullable', 'string'],
            'address' => ['nullable', 'string'],
        ]);

        $this->locationRepo->update($id, $validated);

        return response()->json(['message' => 'Lokasi / Sektor berhasil diperbarui.']);
    }

    public function deleteLocation($id)
    {
        // Lepas perangkat yang terikat ke lokasi ini
        $userId = (string) (Auth::id() ?? request()->attributes->get('firebase_uid'));
        $nodes = $this->nodeRepo->getByUserId($userId);
        foreach ($nodes as $n) {
            if (((string) ($n['location_id'] ?? '')) === (string) $id) {
                $this->nodeRepo->update($n['id'], [
                    'location_id' => null,
                    'nama_lokasi' => null,
                ]);
            }
        }

        $this->locationRepo->delete($id);

        return response()->json(['message' => 'Lokasi berhasil dihapus.']);
    }

    /**
     * Menugaskan daftar perangkat ESP32 ke sebuah Sektor / Lokasi
     */
    public function assignDevicesToLocation(Request $request, $id)
    {
        $validated = $request->validate([
            'device_ids' => ['present', 'array'],
        ]);

        $loc = $this->locationRepo->find($id);
        if (! $loc) {
            return response()->json(['message' => 'Lokasi / Sektor tidak ditemukan.'], 404);
        }

        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));
        $allNodes = $this->nodeRepo->getByUserId($userId);

        $selectedIds = array_map('strval', $validated['device_ids']);

        foreach ($allNodes as $n) {
            $nId = (string) $n['id'];
            $currentlyInThisLoc = ((string) ($n['location_id'] ?? '')) === (string) $id;
            $shouldBeInThisLoc = in_array($nId, $selectedIds, true);

            if ($shouldBeInThisLoc && ! $currentlyInThisLoc) {
                $this->nodeRepo->update($n['id'], [
                    'location_id' => $id,
                    'nama_lokasi' => $loc['name'] ?? 'Sektor '.$id,
                ]);
            } elseif (! $shouldBeInThisLoc && $currentlyInThisLoc) {
                $this->nodeRepo->update($n['id'], [
                    'location_id' => null,
                    'nama_lokasi' => null,
                ]);
            }
        }

        return response()->json([
            'message' => 'Penugasan perangkat ke sektor '.($loc['name'] ?? '').' berhasil disimpan.',
        ]);
    }

    // ==========================================
    // JENIS PERANGKAT (DEVICE TYPES)
    // ==========================================

    public function indexDeviceTypes(Request $request)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));
        $types = $this->deviceTypeRepo->getByUserId($userId);

        return response()->json(['data' => $types]);
    }

    public function storeDeviceType(Request $request)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
        ]);

        $validated['user_id'] = $userId;
        $created = $this->deviceTypeRepo->create($validated);

        return response()->json([
            'message' => 'Jenis perangkat "'.$created['name'].'" berhasil ditambahkan.',
            'data' => $created,
        ], 201);
    }

    public function updateDeviceType(Request $request, $id)
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
        ]);

        $this->deviceTypeRepo->update($id, $validated);

        return response()->json(['message' => 'Jenis perangkat berhasil diperbarui.']);
    }

    public function deleteDeviceType($id)
    {
        $this->deviceTypeRepo->delete($id);

        return response()->json(['message' => 'Jenis perangkat berhasil dihapus.']);
    }

    // ==========================================
    // DEVICES / NODES
    // ==========================================

    public function indexDevices(Request $request)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));
        $nodes = $this->nodeRepo->getByUserId($userId);

        // =========================================================================
        // TEMPLATE SINKRONISASI FIREBASE RTDB (JANGAN DIHAPUS - UNTUK TEMPLATE)
        // =========================================================================
        // if (! empty($nodes) && config('firebase.database_url')) {
        //     try {
        //         $this->syncService->syncFromRealtimeDatabase(null, $userId, false);
        //         $nodes = $this->nodeRepo->getByUserId($userId);
        //     } catch (\Throwable $e) {}
        // }

        // §5.6: SATU threshold detik dari config — status ONLINE/STALE/OFFLINE.
        // Device offline tetap tampil (tidak dihapus/disembunyikan).
        $liveRepo = new NodeLiveRepository;

        $devices = array_map(function ($node) use ($liveRepo) {
            $conn = $this->nodeRepo->connectionStatus($node);
            $isOnline = $conn['state'] === 'ONLINE';

            try {
                $live = $liveRepo->find((string) $node['id']);
                if ($live && isset($live['is_online'])) {
                    $isOnline = $isOnline || (bool) $live['is_online'];
                }
            } catch (\Throwable $e) {
            }

            $sensors = $this->sensorRepo->getByNodeId($node['id']);

            // Lokasi murni bersumber dari penempatan Sektor di Tab Lokasi
            $namaLokasi = '-';
            if (! empty($node['location_id'])) {
                $loc = $this->locationRepo->find($node['location_id']);
                $namaLokasi = $loc['name'] ?? ($node['nama_lokasi'] ?? '-');
            } elseif (! empty($node['nama_lokasi'])) {
                // Dipertahankan untuk data historis lama ("Esp32_T1", dll)
                $namaLokasi = $node['nama_lokasi'];
            }

            return [
                'id' => $node['id'],
                'kode_node' => $node['kode_node'] ?? 'ESP32-WATER-01',
                'device_name' => $node['device_name'] ?? 'ESP32 Water Monitor',
                'nama_lokasi' => $namaLokasi,
                'location_id' => $node['location_id'] ?? null,
                'device_type_id' => $node['device_type_id'] ?? null,
                'device_type' => $node['device_type'] ?? null,
                'device_role' => $node['device_role'] ?? 'node',
                'model_type' => $node['model_type'] ?? null,
                'firmware_version' => $node['firmware_version'] ?? 'v1.0.0',
                'capabilities' => $node['capabilities'] ?? null,
                'ip_address' => $node['ip_address'] ?? null,
                'hardware_id' => $node['hardware_id'] ?? null,
                'status' => $node['status'] ?? 'active',
                'is_online' => $isOnline,
                'connection' => $conn['state'],
                'seconds_ago' => $conn['seconds_ago'],
                'sensor_count' => count($sensors),
                'sensors' => $sensors,
                'last_seen_at' => isset($node['last_seen_at']) ? (string) $node['last_seen_at'] : null,
            ];
        }, $nodes);

        return response()->json(['data' => $devices]);
    }

    /**
     * BUG-4 fix (audit.md §5.5): BUKAN "network discovery" dari latest sensor_data.
     * Mengembalikan device yang benar-benar mengumumkan diri via POST /api/devices/hello
     * dan masih berstatus pending — sumber section "Perangkat Baru Ditemukan".
     */
    public function discoverDevice(Request $request)
    {
        /* =========================================================================
         * TEMPLATE KODE LAMA PEMINDAIAN FIREBASE RTDB (JANGAN DIHAPUS - UNTUK TEMPLATE)
         * =========================================================================
         * $rtdb = $this->getRtdb();
         * if ($rtdb) {
         *     $latest = $rtdb->getReference('/sensor/latest')->getValue();
         *     ...
         * }
         * =========================================================================
         * TEMPLATE KODE LAMA DISCOVERY VIA latest sensor_data (JANGAN DIHAPUS - REFERENSI)
         * =========================================================================
         * $latest = SensorData::with('node')->latest('created_at')->first();
         * ... (menebak kode_node/gateway dari 1 baris terakhir — BUG-4, jangan dipakai)
         * ========================================================================= */

        try {
            $pending = $this->nodeRepo->getPending();

            $detectedDevices = array_map(function (array $n) {
                $conn = $this->nodeRepo->connectionStatus($n);

                return [
                    'id' => $n['id'],
                    'kode_node' => $n['kode_node'],
                    'device_name' => $n['device_name'] ?? $n['kode_node'],
                    'device_role' => $n['device_role'] ?? 'node',
                    'model_type' => $n['model_type'] ?? null,
                    'role' => ($n['device_role'] ?? 'node') === 'gateway'
                        ? 'Gateway Penerima LoRa & WiFi Forwarder'
                        : 'Node Sensor (LoRa Tx)',
                    'firmware_version' => $n['firmware_version'] ?? '1.0.0',
                    'hardware_id' => $n['hardware_id'] ?? null,
                    'ip_address' => $n['ip_address'] ?? null,
                    'capabilities' => $n['capabilities'] ?? null,
                    'already_registered' => false,
                    'registered_node_id' => $n['id'],
                    'is_online' => $conn['state'] === 'ONLINE',
                    'connection' => $conn['state'],
                    'seconds_ago' => $conn['seconds_ago'],
                    'last_seen_at' => isset($n['last_seen_at']) ? (string) $n['last_seen_at'] : null,
                ];
            }, $pending);

            if (empty($detectedDevices)) {
                return response()->json([
                    'detected' => false,
                    'detected_devices' => [],
                    'message' => 'Tidak ada perangkat baru. Perangkat muncul di sini setelah mengirim POST /api/devices/hello.',
                ]);
            }

            $first = $detectedDevices[0];

            return response()->json([
                'detected' => true,
                'detected_devices' => $detectedDevices,
                'preview' => [
                    'kode_node' => $first['kode_node'],
                    'device_name' => $first['device_name'],
                    'model_type' => $first['model_type'],
                    'firmware_version' => $first['firmware_version'],
                    'is_online' => $first['is_online'],
                    'last_seen_seconds_ago' => $first['seconds_ago'],
                    'already_registered' => false,
                    'registered_node_id' => $first['registered_node_id'],
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'detected' => false,
                'message' => 'Gagal memindai perangkat pending: '.$e->getMessage(),
            ], 500);
        }
    }

    public function storeDevice(Request $request)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));
        $validated = $request->validate([
            'kode_node' => ['required', 'string', 'max:50', 'unique:nodes,kode_node'],
            'device_name' => ['nullable', 'string', 'max:100'],
            'nama_lokasi' => ['nullable', 'string', 'max:255'],
            'location_id' => ['nullable', 'exists:locations,id'],
            'device_type_id' => ['nullable', 'exists:device_types,id'],
            'device_role' => ['nullable', 'string', 'in:node,gateway'],
            'model_type' => ['nullable', 'string', 'max:50'],
            'firmware_version' => ['nullable', 'string', 'max:30'],
        ], [
            'kode_node.unique' => 'Perangkat dengan kode node "'.$request->input('kode_node').'" sudah terdaftar di sistem. Gunakan kode yang berbeda.',
            'kode_node.required' => 'Kode node wajib diisi.',
            'location_id.exists' => 'Sektor lokasi yang dipilih tidak valid.',
        ]);

        // Cek kembali keberadaan kode_node sebelum insert
        $existing = $this->nodeRepo->findByKodeNode($validated['kode_node']);
        if ($existing) {
            return response()->json([
                'message' => 'Perangkat dengan kode node "'.$validated['kode_node'].'" sudah terdaftar di sistem.',
                'errors' => ['kode_node' => ['Kode node sudah terdaftar. Gunakan kode yang berbeda atau pilih perangkat yang sudah ada.']],
                'existing_device' => [
                    'id' => $existing['id'],
                    'device_name' => $existing['device_name'] ?? null,
                    'nama_lokasi' => $existing['nama_lokasi'] ?? null,
                ],
            ], 422);
        }

        try {
            $tokenPlaintext = Str::random(40);
            $nodeId = $this->nodeRepo->createNode([
                'user_id' => $userId,
                'kode_node' => $validated['kode_node'],
                'device_name' => $validated['device_name'] ?? 'ESP32 Device',
                'nama_lokasi' => $validated['nama_lokasi'] ?? null,
                'location_id' => $validated['location_id'] ?? null,
                'device_type_id' => $validated['device_type_id'] ?? null,
                'device_role' => $validated['device_role'] ?? 'node',
                'model_type' => $validated['model_type'] ?? null,
                'api_token_hash' => hash('sha256', $tokenPlaintext),
                // §5.4: pra-registrasi via web = pending; hello pertama yang
                // cocok (ada lokasi) mengaktifkannya otomatis.
                'status' => 'pending',
                'firmware_version' => $validated['firmware_version'] ?? '1.0.0',
            ]);

            return response()->json([
                'message' => 'Perangkat berhasil ditambahkan.',
                'data' => [
                    'id' => $nodeId,
                    'kode_node' => $validated['kode_node'],
                    'token' => $tokenPlaintext,
                ],
            ], 201);
        } catch (QueryException $e) {
            if ($e->getCode() == 23000 || str_contains($e->getMessage(), 'Duplicate entry')) {
                return response()->json([
                    'message' => 'Perangkat dengan kode node "'.$validated['kode_node'].'" sudah terdaftar di sistem.',
                    'errors' => ['kode_node' => ['Kode node sudah terdaftar. Silakan gunakan kode node unik lainnya.']],
                ], 422);
            }
            throw $e;
        }
    }

    public function updateDevice(Request $request, $id)
    {
        $validated = $request->validate([
            'device_name' => ['nullable', 'string', 'max:100'],
            'nama_lokasi' => ['sometimes', 'string', 'max:255'],
            'location_id' => ['nullable'],
            'device_type_id' => ['nullable'],
            'device_role' => ['nullable', 'string', 'in:node,gateway'],
            'status' => ['sometimes', 'in:pending,active,inactive'],
            'model_type' => ['nullable', 'string'],
            'firmware_version' => ['nullable', 'string'],
        ]);

        $this->nodeRepo->update($id, $validated);

        return response()->json(['message' => 'Perangkat berhasil diperbarui.']);
    }

    public function deleteDevice($id)
    {
        // 1. Hapus semua sensor terkait
        $sensors = $this->sensorRepo->getByNodeId($id);
        foreach ($sensors as $sensor) {
            $this->sensorRepo->delete($sensor['id']);
        }

        // 2. Hapus status live node
        try {
            (new NodeLiveRepository)->delete((string) $id);
        } catch (\Throwable $ignored) {
        }

        // 3. Hapus record node
        $this->nodeRepo->delete($id);

        return response()->json(['message' => 'Perangkat dan seluruh sensor terkait berhasil dihapus.']);
    }

    // ==========================================
    // SENSORS PER DEVICE
    // ==========================================

    public function indexSensors($nodeId)
    {
        $sensors = $this->sensorRepo->getByNodeId($nodeId);

        return response()->json(['data' => $sensors]);
    }

    /**
     * Rekonsiliasi sensor dari capability manifest hello (§6.1).
     */
    public function autoDetectSensors(Request $request, $nodeId)
    {
        $node = $this->nodeRepo->find($nodeId);
        if (! $node) {
            return response()->json(['message' => 'Perangkat tidak ditemukan.'], 404);
        }

        // BUG-5 fix (audit.md §6.1): reconcile dari capability manifest saat hello.
        // DILARANG: null-check telemetry & data node lain. Kalau node belum pernah
        // hello (capabilities kosong), pakai paket standar sesuai peran sebagai
        // fallback eksplisit yang terdokumentasi — bukan "deteksi".
        $capabilities = $node['capabilities'] ?? null;
        if (empty($capabilities)) {
            $role = strtolower((string) ($node['device_role'] ?? ''));
            $onlyGateway = $role === 'gateway'
                || (stripos($node['model_type'] ?? '', 'Gateway') !== false
                    && stripos($node['model_type'] ?? '', 'Node') === false);
            $capabilities = $onlyGateway
                ? ['lora_rssi', 'lora_snr', 'ai_status']
                : ['ph', 'turbidity', 'water_level', 'temperature', 'humidity', 'vibration'];
        }

        /* =========================================================================
         * TEMPLATE KODE LAMA AUTO-DETECT VIA TELEMETRY (JANGAN DIHAPUS - REFERENSI)
         * BUG-5: fallback SensorData::latest() node lain + array_key_exists(payload).
         * =========================================================================
         * $latestReading = SensorData::where('node_id', $node['id'])->latest('created_at')->first()
         *     ?? SensorData::latest('created_at')->first();
         * ...deteksi via rtdb_keys + $standardCodes + create langsung...
         * ========================================================================= */

        // Definisi sensor kini di App\Services\SensorReconcileService::definitions()
        // (sensor_type_id di-resolve dinamis dari tabel sensor_types — BUG-5 fix).
        // (blok katalog + deteksi telemetry lama dihapus — diganti reconcile di atas)

        $summary = $this->reconcile->reconcile($node, $capabilities);
        $createdCount = $summary['created'] + $summary['reactivated'];

        return response()->json([
            'message' => $createdCount > 0
                ? "Berhasil mendeteksi dan mendaftarkan {$createdCount} sensor dari capability device."
                : 'Seluruh sensor sudah terdaftar dan tersinkronisasi.',
            'count' => $createdCount,
            'deactivated' => $summary['deactivated'],
            'capabilities' => $summary['capabilities'],
            'data' => $summary['sensors'],
        ]);
    }

    public function storeSensor(Request $request, $nodeId)
    {
        $validated = $request->validate([
            'sensor_type_id' => ['required'],
            'name' => ['required', 'string', 'max:100'],
            'code' => ['required', 'string', 'max:50'],
            'pin' => ['nullable', 'string', 'max:50'],
            'unit' => ['nullable', 'string', 'max:20'],
            'min_value' => ['nullable', 'numeric'],
            'max_value' => ['nullable', 'numeric'],
            'warning_threshold_min' => ['nullable', 'numeric'],
            'warning_threshold_max' => ['nullable', 'numeric'],
            'critical_threshold_min' => ['nullable', 'numeric'],
            'critical_threshold_max' => ['nullable', 'numeric'],
            'calibration_data' => ['nullable', 'array'],
            'config' => ['nullable', 'array'],
        ]);

        $validated['node_id'] = $nodeId;
        // §6.2: sensor dari form = manual — reconcile otomatis dilarang menyentuhnya.
        $validated['source'] = 'manual';
        $sensor = $this->sensorRepo->create($validated);

        return response()->json([
            'message' => 'Sensor berhasil ditambahkan ke perangkat.',
            'data' => $sensor,
        ], 201);
    }

    public function updateSensor(Request $request, $id)
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'pin' => ['nullable', 'string', 'max:50'],
            'unit' => ['nullable', 'string', 'max:20'],
            'min_value' => ['nullable', 'numeric'],
            'max_value' => ['nullable', 'numeric'],
            'warning_threshold_min' => ['nullable', 'numeric'],
            'warning_threshold_max' => ['nullable', 'numeric'],
            'critical_threshold_min' => ['nullable', 'numeric'],
            'critical_threshold_max' => ['nullable', 'numeric'],
            'calibration_data' => ['nullable', 'array'],
            'config' => ['nullable', 'array'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $this->sensorRepo->update($id, $validated);

        return response()->json(['message' => 'Sensor berhasil diperbarui.']);
    }

    public function deleteSensor($id)
    {
        $this->sensorRepo->delete($id);

        return response()->json(['message' => 'Sensor berhasil dihapus.']);
    }

    // ==========================================
    // SENSOR TYPES
    // ==========================================

    public function indexSensorTypes()
    {
        try {
            $types = SensorType::all();
            if ($types->isEmpty()) {
                (new SensorTypeSeeder)->run();
                $types = SensorType::all();
            }

            return response()->json(['data' => $types]);
        } catch (\Throwable $e) {
            return response()->json([
                'data' => [
                    ['id' => 1, 'code' => 'ph', 'name' => 'pH Sensor (PH-4502C)', 'unit' => 'pH', 'icon' => 'Droplet', 'chart_type' => 'gauge'],
                    ['id' => 2, 'code' => 'turbidity', 'name' => 'Sensor Kekeruhan Air', 'unit' => 'NTU', 'icon' => 'Activity', 'chart_type' => 'gauge'],
                    ['id' => 3, 'code' => 'water_level', 'name' => 'Ultrasonic Level Air', 'unit' => 'cm', 'icon' => 'Droplet', 'chart_type' => 'area'],
                    ['id' => 4, 'code' => 'temperature', 'name' => 'Suhu Air / Ruang', 'unit' => '°C', 'icon' => 'Thermometer', 'chart_type' => 'line'],
                    ['id' => 5, 'code' => 'humidity', 'name' => 'Kelembapan Udara', 'unit' => '%', 'icon' => 'CloudRain', 'chart_type' => 'line'],
                    ['id' => 6, 'code' => 'vibration', 'name' => 'Sensor Getaran Pompa', 'unit' => 'pulsa', 'icon' => 'Activity', 'chart_type' => 'bar'],
                    ['id' => 7, 'code' => 'mpu', 'name' => 'MPU6050 Gyro & Kestabilan', 'unit' => '°', 'icon' => 'Activity', 'chart_type' => 'gyro'],
                ],
            ]);
        }
    }
}
