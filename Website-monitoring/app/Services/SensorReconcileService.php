<?php

namespace App\Services;

use App\Models\SensorType;
use App\Repositories\SensorRepository;

class SensorReconcileService
{
    /**
     * Alias capability firmware → code sensor_types.
     * Firmware mengirim "mpu6050" (§5.2); katalog memakai "mpu".
     */
    public const CAPABILITY_ALIASES = [
        'mpu6050' => 'mpu',
    ];

    public function __construct(protected SensorRepository $sensorRepo) {}

    /**
     * Katalog definisi sensor per code (selaras sensor_types seed).
     * sensor_type_id di-resolve dinamis dari tabel, bukan hardcode.
     */
    public static function definitions(): array
    {
        return [
            'ph' => ['name' => 'pH Sensor (PH-4502C)', 'pin' => 'GPIO 32', 'unit' => 'pH', 'min_value' => 0.0, 'max_value' => 14.0, 'warning_threshold_min' => 6.5, 'warning_threshold_max' => 8.5, 'critical_threshold_min' => 6.0, 'critical_threshold_max' => 9.0],
            'turbidity' => ['name' => 'Sensor Kekeruhan Air', 'pin' => 'GPIO 33', 'unit' => 'NTU', 'min_value' => 0.0, 'max_value' => 100.0, 'warning_threshold_min' => 0.0, 'warning_threshold_max' => 50.0, 'critical_threshold_min' => 0.0, 'critical_threshold_max' => 75.0],
            'water_level' => ['name' => 'Ultrasonic Level Air (AJ-SR04M)', 'pin' => 'TRIG 14 / ECHO 34', 'unit' => 'cm', 'min_value' => 0.0, 'max_value' => 200.0, 'warning_threshold_min' => 20.0, 'warning_threshold_max' => 85.0, 'critical_threshold_min' => 10.0, 'critical_threshold_max' => 92.0],
            'temperature' => ['name' => 'DHT22 Suhu Air/Ruang', 'pin' => 'GPIO 4', 'unit' => '°C', 'min_value' => 0.0, 'max_value' => 80.0, 'warning_threshold_min' => 20.0, 'warning_threshold_max' => 35.0, 'critical_threshold_min' => 0.0, 'critical_threshold_max' => 40.0],
            'humidity' => ['name' => 'DHT22 Kelembapan Udara', 'pin' => 'GPIO 4', 'unit' => '%', 'min_value' => 0.0, 'max_value' => 100.0, 'warning_threshold_min' => 40.0, 'warning_threshold_max' => 80.0, 'critical_threshold_min' => 20.0, 'critical_threshold_max' => 90.0],
            'vibration' => ['name' => 'Sensor Getaran Pompa', 'pin' => 'GPIO 25', 'unit' => 'pulsa', 'min_value' => 0.0, 'max_value' => 100.0, 'warning_threshold_min' => 0.0, 'warning_threshold_max' => 6.0, 'critical_threshold_min' => 0.0, 'critical_threshold_max' => 20.0],
            'mpu' => ['name' => 'MPU6050 Gyro & Kestabilan', 'pin' => 'SDA 21 / SCL 22', 'unit' => '°', 'min_value' => -90.0, 'max_value' => 90.0, 'warning_threshold_min' => -10.0, 'warning_threshold_max' => 10.0, 'critical_threshold_min' => -25.0, 'critical_threshold_max' => 25.0],
            'lora_rssi' => ['name' => 'Kekuatan Sinyal LoRa (RSSI)', 'pin' => 'SPI SX1276', 'unit' => 'dBm', 'min_value' => -130.0, 'max_value' => 0.0, 'warning_threshold_min' => -110.0, 'warning_threshold_max' => -20.0, 'critical_threshold_min' => -120.0, 'critical_threshold_max' => 0.0],
            'lora_snr' => ['name' => 'Kualitas Sinyal LoRa (SNR)', 'pin' => 'SPI SX1276', 'unit' => 'dB', 'min_value' => -20.0, 'max_value' => 15.0, 'warning_threshold_min' => -10.0, 'warning_threshold_max' => 15.0, 'critical_threshold_min' => -15.0, 'critical_threshold_max' => 15.0],
            'ai_status' => ['name' => 'Edge AI Diagnostic Monitor', 'pin' => 'TinyML Engine', 'unit' => '%', 'min_value' => 0.0, 'max_value' => 100.0, 'warning_threshold_min' => 70.0, 'warning_threshold_max' => 100.0, 'critical_threshold_min' => 50.0, 'critical_threshold_max' => 100.0],
        ];
    }

    /**
     * Normalisasi capability mentah dari firmware menjadi code katalog.
     *
     * @return string[]
     */
    public static function normalizeCapabilities(mixed $capabilities): array
    {
        if (! is_array($capabilities)) {
            return [];
        }

        $defs = self::definitions();
        $codes = [];
        foreach ($capabilities as $raw) {
            $code = strtolower(trim((string) $raw));
            $code = self::CAPABILITY_ALIASES[$code] ?? $code;
            if (isset($defs[$code]) && ! in_array($code, $codes, true)) {
                $codes[] = $code;
            }
        }

        return $codes;
    }

    /**
     * Reconcile sensor node dari capability manifest saat hello (§6.1).
     * - Code auto yang hilang dari capability → is_active=false (JANGAN hapus).
     * - Sensor source=manual TIDAK PERNAH disentuh.
     * - JANGAN pakai data node lain, JANGAN null-check telemetry (BUG-5 fix).
     */
    public function reconcile(array $node, mixed $capabilities): array
    {
        $nodeId = (string) $node['id'];
        $codes = self::normalizeCapabilities($capabilities);
        $defs = self::definitions();

        $existing = $this->sensorRepo->getByNodeId($nodeId);
        $byCode = [];
        foreach ($existing as $s) {
            $byCode[(string) ($s['code'] ?? '')] = $s;
        }

        $created = 0;
        $reactivated = 0;
        $deactivated = 0;

        foreach ($codes as $code) {
            $type = SensorType::firstOrCreate(
                ['code' => $code],
                ['name' => $defs[$code]['name'], 'unit' => $defs[$code]['unit'] ?? '']
            );

            if (! isset($byCode[$code])) {
                $payload = array_merge($defs[$code], [
                    'node_id' => $nodeId,
                    'sensor_type_id' => $type->id,
                    'code' => $code,
                    'source' => 'auto',
                    'is_active' => true,
                ]);
                $this->sensorRepo->create($payload);
                $created++;
            } elseif (($byCode[$code]['source'] ?? 'auto') === 'auto') {
                $this->sensorRepo->update($byCode[$code]['id'], array_merge($defs[$code], [
                    'sensor_type_id' => $type->id,
                    'source' => 'auto',
                    'is_active' => true,
                ]));
                if (empty($byCode[$code]['is_active'])) {
                    $reactivated++;
                }
            }
            // source=manual → dilewati (§6.2)
        }

        foreach ($byCode as $code => $sensor) {
            if (($sensor['source'] ?? 'auto') === 'auto'
                && ! empty($sensor['is_active'])
                && ! in_array($code, $codes, true)) {
                $this->sensorRepo->update($sensor['id'], ['is_active' => false]);
                $deactivated++;
            }
        }

        return [
            'created' => $created,
            'reactivated' => $reactivated,
            'deactivated' => $deactivated,
            'capabilities' => $codes,
            'sensors' => $this->sensorRepo->getByNodeId($nodeId),
        ];
    }
}
