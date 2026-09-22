<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SensorData;
use App\Models\SensorType;
use App\Repositories\DeviceTypeRepository;
use App\Repositories\LocationRepository;
use App\Repositories\NodeLiveRepository;
use App\Repositories\NodeRepository;
use App\Repositories\SensorRepository;
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

        // Threshold 5 menit untuk konsistensi dengan NodeRepository
        $thresholdMinutes = (int) config('watermonitoring.online_threshold_minutes', 5);

        $liveRepo = new NodeLiveRepository;

        $anyNodeOnline = false;
        $latestSeenAt = null;
        foreach ($nodes as $n) {
            if ($this->nodeRepo->isOnline($n, $thresholdMinutes)) {
                $anyNodeOnline = true;
                if (! empty($n['last_seen_at'])) {
                    $latestSeenAt = $n['last_seen_at'];
                }
            }
        }

        $devices = array_map(function ($node) use ($thresholdMinutes, $liveRepo, $anyNodeOnline, $latestSeenAt) {
            $isOnline = $this->nodeRepo->isOnline($node, $thresholdMinutes);

            try {
                $live = $liveRepo->find((string) $node['id']);
                if ($live && isset($live['is_online'])) {
                    $isOnline = $isOnline || (bool) $live['is_online'];
                }
            } catch (\Throwable $e) {
            }

            $isGateway = stripos($node['model_type'] ?? '', 'Gateway') !== false;
            if ($isGateway && $anyNodeOnline) {
                $isOnline = true;
                if (empty($node['last_seen_at']) && $latestSeenAt) {
                    $node['last_seen_at'] = $latestSeenAt;
                }
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
                'model_type' => $node['model_type'] ?? null,
                'firmware_version' => $node['firmware_version'] ?? 'v1.0.0',
                'status' => $node['status'] ?? 'active',
                'is_online' => $isOnline,
                'sensor_count' => count($sensors),
                'sensors' => $sensors,
                'last_seen_at' => isset($node['last_seen_at']) ? (string) $node['last_seen_at'] : null,
            ];
        }, $nodes);

        return response()->json(['data' => $devices]);
    }

    /**
     * Memindai transmisi aktif ESP32 di Database Lokal MySQL
     */
    public function discoverDevice(Request $request)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));

        /* =========================================================================
         * TEMPLATE KODE LAMA PEMINDAIAN FIREBASE RTDB (JANGAN DIHAPUS - UNTUK TEMPLATE)
         * =========================================================================
         * $rtdb = $this->getRtdb();
         * if ($rtdb) {
         *     $latest = $rtdb->getReference('/sensor/latest')->getValue();
         *     ...
         * }
         * ========================================================================= */

        // IMPLEMENTASI LOCAL DATABASE (MySQL & phpMyAdmin)
        try {
            $latest = SensorData::with('node')->latest('created_at')->first();

            if (! $latest) {
                return response()->json([
                    'detected' => false,
                    'message' => 'Belum ada transmisi data sensor dari ESP32 di database lokal MySQL.',
                ]);
            }

            $meta = is_array($latest->metadata) ? $latest->metadata : (json_decode($latest->metadata ?? '[]', true) ?: []);
            $secondsAgo = $latest->created_at ? now()->diffInSeconds($latest->created_at) : 0;
            $isOnline = $secondsAgo <= 300;

            $suggestedCode = $latest->node?->kode_node ?? 'ESP32-WATER-01';
            $gatewayCode = $meta['gateway_id'] ?? 'ESP32-GATEWAY-01';

            // Cek status kedua perangkat di database
            $existingNode = $this->nodeRepo->findByKodeNode($suggestedCode);
            $existingGateway = $this->nodeRepo->findByKodeNode($gatewayCode);

            $alreadyRegistered = ! empty($existingNode);
            $registeredNode = $existingNode;

            $detectedDevices = [
                [
                    'kode_node' => $suggestedCode,
                    'device_name' => $existingNode['device_name'] ?? 'Unit Sensor ESP32 Utama (Node)',
                    'model_type' => 'Node Sensor',
                    'role' => 'Node Sensor (LoRa Tx)',
                    'firmware_version' => $existingNode['firmware_version'] ?? '1.0.0',
                    'already_registered' => ! empty($existingNode),
                    'registered_node_id' => $existingNode['id'] ?? null,
                    'is_online' => $isOnline,
                ],
                [
                    'kode_node' => $gatewayCode,
                    'device_name' => $existingGateway['device_name'] ?? 'Unit Gateway ESP32 (LoRa to WiFi)',
                    'model_type' => 'ESP32 Gateway (LoRa)',
                    'role' => 'Gateway Penerima LoRa & WiFi Forwarder',
                    'firmware_version' => $existingGateway['firmware_version'] ?? '1.0.2',
                    'already_registered' => ! empty($existingGateway),
                    'registered_node_id' => $existingGateway['id'] ?? null,
                    'is_online' => $isOnline,
                ],
            ];

            return response()->json([
                'detected' => true,
                'detected_devices' => $detectedDevices,
                'preview' => [
                    'kode_node' => $suggestedCode,
                    'device_name' => $latest->node?->device_name ?? 'Unit Sensor ESP32 Utama (Node)',
                    'model_type' => $latest->node?->model_type ?? 'Node Sensor',
                    'firmware_version' => $latest->node?->firmware_version ?? '1.0.0',
                    'rssi' => $meta['rssi'] ?? -45,
                    'snr' => $meta['snr'] ?? 9.25,
                    'ai_status' => $latest->ai_status ?? 'Normal',
                    'is_online' => $isOnline,
                    'last_seen_seconds_ago' => $secondsAgo,
                    'metrics' => [
                        'ph' => $latest->ph !== null ? (float) $latest->ph : null,
                        'turbidity' => $latest->turbidity !== null ? (int) $latest->turbidity : null,
                        'water_level' => $latest->water_level !== null ? (float) $latest->water_level : null,
                        'temperature' => $latest->temp !== null ? (float) $latest->temp : null,
                        'humidity' => $latest->humidity !== null ? (float) $latest->humidity : null,
                        'vibration' => (int) $latest->vibration,
                    ],
                    'already_registered' => $alreadyRegistered,
                    'registered_node_id' => $registeredNode['id'] ?? null,
                    'registered_device_name' => $registeredNode['device_name'] ?? null,
                    'registered_nama_lokasi' => $registeredNode['nama_lokasi'] ?? null,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'detected' => false,
                'message' => 'Gagal memindai ESP32 di database lokal: '.$e->getMessage(),
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
            'model_type' => ['nullable', 'string', 'max:50'],
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
                'model_type' => $validated['model_type'] ?? null,
                'api_token_hash' => hash('sha256', $tokenPlaintext),
                'status' => 'active',
                'firmware_version' => '1.0.0',
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
            'status' => ['sometimes', 'in:active,inactive'],
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
     * Otomatis mendeteksi dan mendaftarkan sensor dari transmisi ESP32
     */
    public function autoDetectSensors(Request $request, $nodeId)
    {
        $node = $this->nodeRepo->find($nodeId);
        if (! $node) {
            return response()->json(['message' => 'Perangkat tidak ditemukan.'], 404);
        }

        $latestReading = SensorData::where('node_id', $node['id'])->latest('created_at')->first()
            ?? SensorData::latest('created_at')->first();
        $latest = null;
        if ($latestReading) {
            $meta = is_array($latestReading->metadata) ? $latestReading->metadata : (json_decode($latestReading->metadata ?? '[]', true) ?: []);
            $latest = [
                'ph' => $latestReading->ph,
                'turbidity' => $latestReading->turbidity,
                'water_level' => $latestReading->water_level,
                'ketinggian_air' => $latestReading->water_level,
                'temp' => $latestReading->temp,
                'suhu' => $latestReading->temp,
                'humidity' => $latestReading->humidity,
                'kelembapan' => $latestReading->humidity,
                'vibration' => $latestReading->vibration,
                'getaran' => $latestReading->vibration,
                'mpu_x' => $latestReading->mpu_x,
                'rssi' => $meta['rssi'] ?? null,
                'snr' => $meta['snr'] ?? null,
                'ai_status' => $latestReading->ai_status,
            ];
        }

        $existingSensors = $this->sensorRepo->getByNodeId($nodeId);
        $existingCodes = array_column($existingSensors, 'code');

        // Katalog lengkap sensor yang didukung
        $allSensorDefs = [
            'ph' => [
                'name' => 'pH Sensor (PH-4502C)',
                'code' => 'ph',
                'pin' => 'GPIO 32',
                'unit' => 'pH',
                'min_value' => 0.0,
                'max_value' => 14.0,
                'warning_threshold_min' => 6.5,
                'warning_threshold_max' => 8.5,
                'critical_threshold_min' => 6.0,
                'critical_threshold_max' => 9.0,
                'sensor_type_id' => 1,
                'rtdb_keys' => ['ph'],
            ],
            'turbidity' => [
                'name' => 'Sensor Kekeruhan Air',
                'code' => 'turbidity',
                'pin' => 'GPIO 33',
                'unit' => 'NTU',
                'min_value' => 0.0,
                'max_value' => 100.0,
                'warning_threshold_min' => 0.0,
                'warning_threshold_max' => 50.0,
                'critical_threshold_min' => 0.0,
                'critical_threshold_max' => 75.0,
                'sensor_type_id' => 2,
                'rtdb_keys' => ['turbidity'],
            ],
            'water_level' => [
                'name' => 'Ultrasonic Level Air (AJ-SR04M)',
                'code' => 'water_level',
                'pin' => 'TRIG 14 / ECHO 34',
                'unit' => 'cm',
                'min_value' => 0.0,
                'max_value' => 200.0,
                'warning_threshold_min' => 20.0,
                'warning_threshold_max' => 85.0,
                'critical_threshold_min' => 10.0,
                'critical_threshold_max' => 92.0,
                'sensor_type_id' => 3,
                'rtdb_keys' => ['ketinggian_air', 'water_level'],
            ],
            'temperature' => [
                'name' => 'DHT22 Suhu Air/Ruang',
                'code' => 'temperature',
                'pin' => 'GPIO 4',
                'unit' => '°C',
                'min_value' => 0.0,
                'max_value' => 80.0,
                'warning_threshold_min' => 20.0,
                'warning_threshold_max' => 35.0,
                'critical_threshold_min' => 0.0,
                'critical_threshold_max' => 40.0,
                'sensor_type_id' => 4,
                'rtdb_keys' => ['suhu', 'temp', 'temperature'],
            ],
            'humidity' => [
                'name' => 'DHT22 Kelembapan Udara',
                'code' => 'humidity',
                'pin' => 'GPIO 4',
                'unit' => '%',
                'min_value' => 0.0,
                'max_value' => 100.0,
                'warning_threshold_min' => 40.0,
                'warning_threshold_max' => 80.0,
                'critical_threshold_min' => 20.0,
                'critical_threshold_max' => 90.0,
                'sensor_type_id' => 5,
                'rtdb_keys' => ['kelembapan', 'humidity'],
            ],
            'vibration' => [
                'name' => 'Sensor Getaran Pompa',
                'code' => 'vibration',
                'pin' => 'GPIO 25',
                'unit' => 'pulsa',
                'min_value' => 0.0,
                'max_value' => 100.0,
                'warning_threshold_min' => 0.0,
                'warning_threshold_max' => 6.0,
                'critical_threshold_min' => 0.0,
                'critical_threshold_max' => 20.0,
                'sensor_type_id' => 6,
                'rtdb_keys' => ['getaran', 'vibration', 'vibration_rms'],
            ],
            'mpu' => [
                'name' => 'MPU6050 Gyro & Kestabilan',
                'code' => 'mpu',
                'pin' => 'SDA 21 / SCL 22',
                'unit' => '°',
                'min_value' => -90.0,
                'max_value' => 90.0,
                'warning_threshold_min' => -10.0,
                'warning_threshold_max' => 10.0,
                'critical_threshold_min' => -25.0,
                'critical_threshold_max' => 25.0,
                'sensor_type_id' => 7,
                'rtdb_keys' => ['mpu_x', 'mpu_y', 'mpu_z', 'roll', 'pitch', 'yaw', 'stability_status', 'acc_x', 'acc_y', 'acc_z'],
            ],
            'lora_rssi' => [
                'name' => 'Kekuatan Sinyal LoRa (RSSI)',
                'code' => 'lora_rssi',
                'pin' => 'SPI SX1276',
                'unit' => 'dBm',
                'min_value' => -130.0,
                'max_value' => 0.0,
                'warning_threshold_min' => -110.0,
                'warning_threshold_max' => -20.0,
                'critical_threshold_min' => -120.0,
                'critical_threshold_max' => 0.0,
                'sensor_type_id' => 8,
                'rtdb_keys' => ['rssi'],
            ],
            'lora_snr' => [
                'name' => 'Kualitas Sinyal LoRa (SNR)',
                'code' => 'lora_snr',
                'pin' => 'SPI SX1276',
                'unit' => 'dB',
                'min_value' => -20.0,
                'max_value' => 15.0,
                'warning_threshold_min' => -10.0,
                'warning_threshold_max' => 15.0,
                'critical_threshold_min' => -15.0,
                'critical_threshold_max' => 15.0,
                'sensor_type_id' => 9,
                'rtdb_keys' => ['snr'],
            ],
            'ai_status' => [
                'name' => 'Edge AI Diagnostic Monitor',
                'code' => 'ai_status',
                'pin' => 'TinyML Engine',
                'unit' => '%',
                'min_value' => 0.0,
                'max_value' => 100.0,
                'warning_threshold_min' => 70.0,
                'warning_threshold_max' => 100.0,
                'critical_threshold_min' => 50.0,
                'critical_threshold_max' => 100.0,
                'sensor_type_id' => 10,
                'rtdb_keys' => ['ai_status', 'ai_confidence'],
            ],
        ];

        $isGatewayOnly = stripos($node['model_type'] ?? '', 'Gateway') !== false && stripos($node['model_type'] ?? '', 'Node') === false;

        $standardCodes = $isGatewayOnly
            ? ['lora_rssi', 'lora_snr', 'ai_status']
            : ['ph', 'turbidity', 'water_level', 'temperature', 'humidity', 'vibration'];

        if (is_array($latest) && ! empty($latest)) {
            // Deteksi dari payload RTDB yang aktual
            $sensorsToRegister = [];
            foreach ($allSensorDefs as $code => $def) {
                foreach ($def['rtdb_keys'] as $key) {
                    if (array_key_exists($key, $latest)) {
                        $sensorsToRegister[$code] = $def;
                        break;
                    }
                }
            }
            // Jika payload tidak mengandung satupun sensor standar, fallback ke standar
            if (empty($sensorsToRegister)) {
                foreach ($standardCodes as $code) {
                    $sensorsToRegister[$code] = $allSensorDefs[$code];
                }
            }
        } else {
            // Tidak ada RTDB: daftarkan sensor standar
            $sensorsToRegister = [];
            foreach ($standardCodes as $code) {
                $sensorsToRegister[$code] = $allSensorDefs[$code];
            }
        }

        $createdCount = 0;
        foreach ($sensorsToRegister as $code => $spec) {
            if (! in_array($code, $existingCodes)) {
                $data = $spec;
                unset($data['rtdb_keys']); // hapus helper key sebelum simpan
                $data['node_id'] = (string) $nodeId;
                $this->sensorRepo->create($data);
                $createdCount++;
            }
        }

        $updatedSensors = $this->sensorRepo->getByNodeId($nodeId);

        return response()->json([
            'message' => $createdCount > 0
                ? "Berhasil mendeteksi dan mendaftarkan {$createdCount} sensor dari transmisi ESP32."
                : 'Seluruh sensor sudah terdaftar dan tersinkronisasi.',
            'count' => $createdCount,
            'data' => $updatedSensors,
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
