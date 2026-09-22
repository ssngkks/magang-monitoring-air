<?php

namespace App\Repositories;

use App\Models\SensorDataHourly;

/* =========================================================================
 * TEMPLATE KODE LAMA FIREBASE HOURLY AGGREGATION (JANGAN DIHAPUS - UNTUK TEMPLATE)
 * =========================================================================
 * class SensorHourlyAggRepositoryFirebase extends FirestoreRepository
 * {
 *     public function __construct() { parent::__construct('sensor_hourly_agg'); }
 *     public function upsertHourly(string $nodeId, string $hourIso, array $averages, int $sampleCount, ?string $userId = null): void { ... }
 * }
 * ========================================================================= */

class SensorHourlyAggRepository
{
    public function upsertHourly(string|int $nodeId, string $hourIso, array $averages, int $sampleCount, ?string $userId = null): void
    {
        $numericNodeId = is_numeric($nodeId) ? (int) $nodeId : 1;

        SensorDataHourly::updateOrCreate(
            [
                'node_id' => $numericNodeId,
                'hour' => $hourIso,
            ],
            [
                'avg_ph' => $averages['ph'] ?? null,
                'avg_temp' => $averages['temp'] ?? null,
                'avg_turbidity' => $averages['turbidity'] ?? null,
                'avg_humidity' => $averages['humidity'] ?? null,
                'avg_water_level' => $averages['water_level'] ?? null,
                'sample_count' => $sampleCount,
            ]
        );
    }

    public function getByNodeId(string|int $nodeId, int $limit = 168): array
    {
        $numericNodeId = is_numeric($nodeId) ? (int) $nodeId : 1;

        return SensorDataHourly::where('node_id', $numericNodeId)
            ->orderBy('hour', 'desc')
            ->limit($limit)
            ->get()
            ->toArray();
    }

    public function getRange(string|int $nodeId, string $fromHour, string $toHour): array
    {
        $numericNodeId = is_numeric($nodeId) ? (int) $nodeId : 1;

        return SensorDataHourly::where('node_id', $numericNodeId)
            ->where('hour', '>=', $fromHour)
            ->where('hour', '<=', $toHour)
            ->orderBy('hour', 'desc')
            ->get()
            ->toArray();
    }
}
